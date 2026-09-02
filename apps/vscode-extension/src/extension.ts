import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process"
import { createInterface } from "node:readline"
import { BridgeClient } from "./bridge-client.ts"
import { buildClaimTree } from "./claim-tree.ts"
type Disposable = { dispose(): void }; type ExtensionContext = { subscriptions: Disposable[] }; type Pending = { resolve(value: unknown): void; reject(error: Error): void }
class BridgeSession implements Disposable {
  private process: ChildProcessWithoutNullStreams; private pending = new Map<string, Pending>(); private sequence = 0
  constructor(private client: BridgeClient) { const spec = client.spawnSpec(); this.process = spawn(spec.command, spec.args, { cwd: spec.cwd, env: spec.env, stdio: ["pipe", "pipe", "pipe"] }); createInterface({ input: this.process.stdout }).on("line", line => this.receive(line)); this.process.once("exit", () => this.failAll(new Error("MathOS bridge exited"))) }
  async start() { await this.request("hello", this.client.hello()) }
  request(method: string, params: unknown = {}) { const id = `vscode-${++this.sequence}`; return new Promise<unknown>((resolve, reject) => { this.pending.set(id, { resolve, reject }); this.process.stdin.write(`${JSON.stringify(this.client.request(id, method, params))}\n`) }) }
  private receive(line: string) { try { const response = JSON.parse(line) as { id: string; ok: boolean; result?: unknown; error?: { message?: string } }; const pending = this.pending.get(response.id); if (!pending) return; this.pending.delete(response.id); response.ok ? pending.resolve(response.result) : pending.reject(new Error(response.error?.message ?? "Bridge request failed")) } catch {} }
  private failAll(error: Error) { for (const pending of this.pending.values()) pending.reject(error); this.pending.clear() }
  dispose() { try { this.process.stdin.write(`${JSON.stringify(this.client.request(`vscode-${++this.sequence}`, "shutdown", {}))}\n`) } catch {}; setTimeout(() => this.process.kill(), 250).unref() }
}
export async function activate(context: ExtensionContext): Promise<{ authority: "BRIDGE_ONLY" }> {
  const vscode: any = await import("vscode"), folder = vscode.workspace.workspaceFolders?.[0]
  if (!folder) return { authority: "BRIDGE_ONLY" }
  const root = folder.uri.fsPath, trusted = vscode.workspace.isTrusted, executablePath = vscode.workspace.getConfiguration("mathos").get("executablePath", "mathos")
  const session = new BridgeSession(new BridgeClient({ workspaceRoot: root, trusted, executablePath })); context.subscriptions.push(session)
  const state: { claims: any[]; graph: any; status: string } = { claims: [], graph: null, status: "Connecting" }, emitter = new vscode.EventEmitter(); context.subscriptions.push(emitter)
  const refresh = async () => { state.claims = await session.request("claims.list") as any[]; state.graph = await session.request("graph.snapshot"); state.status = "Connected"; emitter.fire() }
  const item = (label: string, collapsibleState = vscode.TreeItemCollapsibleState.None) => new vscode.TreeItem(label, collapsibleState)
  const claimsProvider = { onDidChangeTreeData: emitter.event, getTreeItem: (value: any) => value, getChildren: (parent?: any) => parent?.children ?? buildClaimTree(state.claims, 0).map(group => Object.assign(item(group.label, vscode.TreeItemCollapsibleState.Expanded), { children: group.children.map(child => Object.assign(item(child.label), { command: { command: "mathos.openClaim", title: "Open Claim", arguments: [child.id] } })) })) }
  const objectiveProvider = { onDidChangeTreeData: emitter.event, getTreeItem: (value: any) => value, getChildren: () => { const objective = state.graph?.nodes?.find((node: any) => node.kind === "OBJECTIVE"); return [item(objective ? `${objective.id} ${objective.title ?? ""}` : "No objective selected")] } }
  const statusProvider = { onDidChangeTreeData: emitter.event, getTreeItem: (value: any) => value, getChildren: () => [item(state.status)] }
  context.subscriptions.push(vscode.window.registerTreeDataProvider("mathosObjective", objectiveProvider), vscode.window.registerTreeDataProvider("mathosClaims", claimsProvider), vscode.window.registerTreeDataProvider("mathosStatus", statusProvider))
  const register = (name: string, callback: (...args: any[]) => any) => context.subscriptions.push(vscode.commands.registerCommand(name, callback))
  register("mathos.refresh", refresh); register("mathos.showObjective", () => vscode.commands.executeCommand("mathosObjective.focus")); register("mathos.openClaim", async (id?: string) => { const claim = state.claims.find(value => value.id === id) ?? state.claims[0]; if (claim) await vscode.window.showInformationMessage(`${claim.id}: ${claim.title}\n${claim.naturalStatement ?? claim.statement ?? ""}`) }); register("mathos.openAtlas", () => vscode.window.createTerminal({ name: "MathOS Atlas", cwd: root }).sendText(`"${executablePath}" atlas`)); register("mathos.doctor", () => vscode.window.createTerminal({ name: "MathOS Doctor", cwd: root }).sendText(`"${executablePath}" doctor`))
  try { await session.start(); await refresh() } catch (error) { state.status = `Blocked: ${error instanceof Error ? error.message : String(error)}`; emitter.fire(); await vscode.window.showWarningMessage(`MathOS: ${state.status}`) }
  return { authority: "BRIDGE_ONLY" }
}
export function deactivate(): void {}
export { BridgeClient } from "./bridge-client.ts"; export { buildClaimTree } from "./claim-tree.ts"; export { MathOSCommands } from "./commands.ts"
