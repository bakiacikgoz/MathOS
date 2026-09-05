import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process"
import { createInterface } from "node:readline"
import { redactText } from "@mathos/models"
import { BridgeClient } from "./bridge-client.ts"
import { buildClaimTree } from "./claim-tree.ts"
type Disposable = { dispose(): void }; type ExtensionContext = { subscriptions: Disposable[] }; type Pending = { resolve(value: unknown): void; reject(error: Error): void }
export class BridgeSession implements Disposable {
  private process: ChildProcessWithoutNullStreams; private pending = new Map<string, Pending>(); private sequence = 0; private stderr = ""; private closedError: Error | null = null
  constructor(private client: BridgeClient) {
    const spec = client.spawnSpec()
    this.process = spawn(spec.command, spec.args, { cwd: spec.cwd, env: spec.env, stdio: ["pipe", "pipe", "pipe"] })
    const stdout = createInterface({ input: this.process.stdout })
    stdout.on("line", line => this.receive(line))
    stdout.on("error", error => this.close(new Error(`MathOS bridge stdout failed: ${error.message}`)))
    this.process.stderr.setEncoding("utf8")
    this.process.stderr.on("data", chunk => { this.stderr = `${this.stderr}${String(chunk)}`.slice(-4_000) })
    this.process.stderr.on("error", error => this.close(new Error(`MathOS bridge stderr failed: ${error.message}`)))
    this.process.stdin.on("error", error => this.close(new Error(`MathOS bridge stdin failed: ${error.message}`)))
    this.process.once("error", error => this.close(new Error(`MathOS bridge failed to start: ${error.message}`)))
    this.process.once("exit", (code, signal) => {
      const detail = redactText(this.stderr.trim()).slice(-2_000)
      this.close(new Error(`MathOS bridge exited${code === null ? "" : ` with code ${code}`}${signal ? ` (${signal})` : ""}${detail ? `: ${detail}` : ""}`))
    })
  }
  async start() { await this.request("hello", this.client.hello()) }
  request(method: string, params: unknown = {}) {
    if (this.closedError) return Promise.reject(this.closedError)
    const id = `vscode-${++this.sequence}`
    return new Promise<unknown>((resolve, reject) => {
      this.pending.set(id, { resolve, reject })
      this.process.stdin.write(`${JSON.stringify(this.client.request(id, method, params))}\n`, error => {
        if (!error) return
        const pending = this.pending.get(id)
        if (!pending) return
        this.pending.delete(id)
        pending.reject(new Error(`MathOS bridge stdin write failed: ${error.message}`))
      })
    })
  }
  private receive(line: string) { try { const response = JSON.parse(line) as { id: string; ok: boolean; result?: unknown; error?: { message?: string } }; const pending = this.pending.get(response.id); if (!pending) return; this.pending.delete(response.id); response.ok ? pending.resolve(response.result) : pending.reject(new Error(response.error?.message ?? "Bridge request failed")) } catch {} }
  private failAll(error: Error) { for (const pending of this.pending.values()) pending.reject(error); this.pending.clear() }
  private close(error: Error) { if (this.closedError) return; this.closedError = error; this.failAll(error) }
  dispose() { try { this.process.stdin.write(`${JSON.stringify(this.client.request(`vscode-${++this.sequence}`, "shutdown", {}))}\n`) } catch {}; setTimeout(() => this.process.kill(), 250).unref() }
}
export async function activate(context: ExtensionContext): Promise<{ authority: "BRIDGE_ONLY"; snapshot?: () => { claims: any[]; objective: any; providers: any[]; status: string } }> {
  const vscode: any = await import("vscode"), folder = vscode.workspace.workspaceFolders?.[0]
  if (!folder) return { authority: "BRIDGE_ONLY" }
  const root = folder.uri.fsPath, trusted = vscode.workspace.isTrusted, executablePath = vscode.workspace.getConfiguration("mathos").get("executablePath", "mathos")
  const session = new BridgeSession(new BridgeClient({ workspaceRoot: root, trusted, executablePath })); context.subscriptions.push(session)
  const state: { claims: any[]; graph: any; providers: any[]; status: string } = { claims: [], graph: null, providers: [], status: "Connecting" }, emitter = new vscode.EventEmitter(); context.subscriptions.push(emitter)
  const refresh = async () => { state.claims = await session.request("claims.list") as any[]; state.graph = await session.request("graph.snapshot"); state.providers = await session.request("providers.list") as any[]; state.status = "Connected"; emitter.fire() }
  const item = (label: string, collapsibleState = vscode.TreeItemCollapsibleState.None) => new vscode.TreeItem(label, collapsibleState)
  const claimsProvider = { onDidChangeTreeData: emitter.event, getTreeItem: (value: any) => value, getChildren: (parent?: any) => parent?.children ?? buildClaimTree(state.claims, 0).map(group => Object.assign(item(group.label, vscode.TreeItemCollapsibleState.Expanded), { children: group.children.map(child => Object.assign(item(child.label), { command: { command: "mathos.openClaim", title: "Open Claim", arguments: [child.id] } })) })) }
  const objectiveProvider = { onDidChangeTreeData: emitter.event, getTreeItem: (value: any) => value, getChildren: () => { const objective = state.graph?.nodes?.find((node: any) => node.kind === "OBJECTIVE"); return [item(objective ? `${objective.id} ${objective.title ?? ""}` : "No objective selected")] } }
  const statusProvider = { onDidChangeTreeData: emitter.event, getTreeItem: (value: any) => value, getChildren: () => [item(state.status)] }
  const providersProvider = { onDidChangeTreeData: emitter.event, getTreeItem: (value: any) => value, getChildren: () => state.providers.map(provider => item(`${provider.profile} · ${provider.connection} · ${provider.billing}`)) }
  context.subscriptions.push(vscode.window.registerTreeDataProvider("mathosObjective", objectiveProvider), vscode.window.registerTreeDataProvider("mathosClaims", claimsProvider), vscode.window.registerTreeDataProvider("mathosStatus", statusProvider), vscode.window.registerTreeDataProvider("mathosProviders", providersProvider))
  const register = (name: string, callback: (...args: any[]) => any) => context.subscriptions.push(vscode.commands.registerCommand(name, callback))
  register("mathos.refresh", refresh); register("mathos.showObjective", () => vscode.commands.executeCommand("mathosObjective.focus")); register("mathos.openClaim", (id?: string) => { const claim = state.claims.find(value => value.id === id) ?? state.claims[0]; if (!claim) return null; void vscode.window.showInformationMessage(`${claim.id}: ${claim.title}\n${claim.naturalStatement ?? claim.statement ?? ""}`); return claim }); register("mathos.openAtlas", () => vscode.window.createTerminal({ name: "MathOS Atlas", cwd: root }).sendText(`"${executablePath}" atlas`)); register("mathos.doctor", () => vscode.window.createTerminal({ name: "MathOS Doctor", cwd: root }).sendText(`"${executablePath}" doctor`))
  register("mathos.showModelProviders", () => vscode.commands.executeCommand("mathosProviders.focus")); register("mathos.selectModelProfile", async (profile?: string) => session.request("providers.select", { profile: profile ?? await vscode.window.showQuickPick(state.providers.map(value => value.profile)) })); register("mathos.refreshProviderStatus", async () => { state.providers = await session.request("providers.refresh") as any[]; emitter.fire() }); register("mathos.showProviderQuota", async (profile?: string) => { const quota = await session.request("providers.quota", { profile: profile ?? state.providers[0]?.profile }); void vscode.window.showInformationMessage(JSON.stringify(quota, null, 2)); return quota })
  try { await session.start(); await refresh() } catch (error) { state.status = `Blocked: ${error instanceof Error ? error.message : String(error)}`; emitter.fire(); await vscode.window.showWarningMessage(`MathOS: ${state.status}`) }
  return { authority: "BRIDGE_ONLY", snapshot: () => ({ claims: state.claims.map(claim => ({ ...claim })), objective: state.graph?.nodes?.find((node: any) => node.kind === "OBJECTIVE") ?? null, providers: state.providers.map(provider => ({ ...provider })), status: state.status }) }
}
export function deactivate(): void {}
export { BridgeClient } from "./bridge-client.ts"; export { buildClaimTree } from "./claim-tree.ts"; export { MathOSCommands } from "./commands.ts"
