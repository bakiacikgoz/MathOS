import type { SetupCapability, SetupReport } from "@mathos/domain"
export type SetupCapabilityName = "git" | "lean" | "elan" | "lake" | "python" | "model" | "literature" | "computation" | "vscode" | "secret-store"
export interface SetupProbeRuntime { which(name: string): string | null; run(command: string[]): Promise<{ exitCode: number; output: string }> }
const runtime: SetupProbeRuntime = { which: name => Bun.which(name), run: async command => { const p = Bun.spawn(command, { stdout: "pipe", stderr: "pipe", stdin: "ignore" }); const [exitCode, out, err] = await Promise.all([p.exited, new Response(p.stdout).text(), new Response(p.stderr).text()]); return { exitCode, output: `${out}${err}`.trim() } } }
export async function probeSetupCapability(name: SetupCapabilityName, host: SetupProbeRuntime = runtime): Promise<SetupCapability> {
  if (name === "model") return { name, state: process.env.MATHOS_API_KEY || Object.keys(process.env).some(k => k.startsWith("MATHOS_SECRET_MODEL_")) ? "CONFIGURED" : "BLOCKED", detail: "Remote model requires an explicit profile and secret reference" }
  if (name === "literature") return { name, state: "AVAILABLE", detail: "Provider clients available; remote use remains consent-gated" }
  if (name === "secret-store") return { name, state: "AVAILABLE", detail: process.platform === "win32" ? "environment-only secure fallback" : "native secure backend requires capability probe" }
  if (name === "computation") return { name, state: process.platform === "darwin" ? "AVAILABLE" : "BLOCKED", detail: process.platform === "darwin" ? "sandbox backend available for probe" : "production sandbox not verified on this platform" }
  if (name === "vscode") return { name, state: "AVAILABLE", detail: "VS Code extension artifact available" }
  const executable = name === "git" ? "git" : name
  if (!host.which(executable)) return { name, state: name === "python" || name === "elan" ? "OPTIONAL_MISSING" : "BLOCKED", detail: `${executable} not found on PATH` }
  const result = await host.run([executable, "--version"])
  return result.exitCode === 0 ? { name, state: "VERIFIED", detail: result.output.split(/\r?\n/)[0] || `${name} smoke passed` } : { name, state: "BLOCKED", detail: `${name} detected but smoke failed: ${result.output}` }
}
export class SetupService {
  constructor(private readonly dependencies: { probe(name: SetupCapabilityName): Promise<SetupCapability>; load(): SetupReport | null; save(report: SetupReport): void } = { probe: probeSetupCapability, load: () => null, save: () => {} }) {}
  status(): SetupReport { return this.dependencies.load() ?? { state: "NOT_STARTED", updatedAt: new Date(0).toISOString(), capabilities: [] } }
  async run(names: SetupCapabilityName[]): Promise<SetupReport> { const previous = this.dependencies.load(), capabilities: SetupCapability[] = []; for (const name of names) { const retained = previous?.capabilities.find(item => item.name === name && item.state === "VERIFIED"); capabilities.push(retained ?? await this.dependencies.probe(name)) } const blocked = capabilities.some(item => item.state === "BLOCKED"), ready = capabilities.every(item => !["BLOCKED", "DETECTED"].includes(item.state)); const report: SetupReport = { state: ready ? "READY" : blocked ? "PARTIAL" : "IN_PROGRESS", updatedAt: new Date().toISOString(), capabilities }; this.dependencies.save(report); return report }
}
export function leanSetupPlan(options: { install: boolean; acceptedDownloads: string[] }): { commands: string[][] } { if (!options.install || !options.acceptedDownloads.includes("lean") || !options.acceptedDownloads.includes("mathlib")) return { commands: [] }; return { commands: [["elan", "toolchain", "install"], ["lake", "update"], ["lake", "exe", "cache", "get"], ["lake", "build"]] } }
