import { chmod, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { spawn } from "node:child_process"
import { evaluateExperimentPolicy } from "../policy"
import { blockedResult, type SandboxRuntime, type SandboxedExecutionRequest } from "../sandbox"

const IMAGE = "python:3.12-alpine"
const BACKEND = "docker-container"

function dockerEnvironment(): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {}
  for (const name of ["PATH", "DOCKER_HOST", "DOCKER_CONTEXT", "HOME"]) if (process.env[name]) env[name] = process.env[name]
  return env
}

export function dockerRunArguments(root: string): string[] {
  return ["run", "--rm", "--network", "none", "--read-only", "--cap-drop", "ALL", "--security-opt", "no-new-privileges", "--pids-limit", "1", "--memory", "256m", "--cpus", "1", "--user", "65534:65534", "--volume", `${root}:/work:rw`, "--workdir", "/work", "--env", "HOME=/work", "--env", "TMPDIR=/work", IMAGE, "python3", "-I", "-B", "experiment.py"]
}

export class ContainerSandboxRuntime implements SandboxRuntime {
  async inspect() {
    const docker = Bun.which("docker")
    if (!docker) return { available: false, backend: BACKEND, reason: "EXPERIMENT_BLOCKED_SANDBOX_UNAVAILABLE: docker not installed", networkIsolation: false }
    const info = Bun.spawnSync([docker, "info", "--format", "{{.ServerVersion}}"], { env: dockerEnvironment(), stdout: "ignore", stderr: "ignore" })
    const image = Bun.spawnSync([docker, "image", "inspect", IMAGE], { env: dockerEnvironment(), stdout: "ignore", stderr: "ignore" })
    if (info.exitCode !== 0) return { available: false, backend: BACKEND, reason: "EXPERIMENT_BLOCKED_SANDBOX_UNAVAILABLE: docker daemon unavailable", networkIsolation: false }
    if (image.exitCode !== 0) return { available: false, backend: BACKEND, reason: `EXPERIMENT_BLOCKED_SANDBOX_UNAVAILABLE: pull ${IMAGE} first`, networkIsolation: false }
    return { available: true, backend: BACKEND, reason: null, networkIsolation: true }
  }

  async execute(request: SandboxedExecutionRequest) {
    const capability = await this.inspect()
    if (!capability.available) return blockedResult(request, capability.reason!, BACKEND)
    let root: string | undefined
    try {
      const info = await stat(request.scriptPath)
      if (!info.isFile() || info.size > 65_536 || request.executable !== "python3") return blockedResult(request, "EXPERIMENT_BLOCKED_POLICY", BACKEND)
      const code = await readFile(request.scriptPath)
      const policy = evaluateExperimentPolicy({ ...request, codeBytes: code.byteLength })
      if (!policy.allowed) return blockedResult(request, policy.blockedReason!, BACKEND)
      root = await mkdtemp(join(tmpdir(), "mathos-container-")); await chmod(root, 0o777); await writeFile(join(root, "experiment.py"), code, { mode: 0o644 })
      const started = Date.now(), child = spawn("docker", dockerRunArguments(root), { env: dockerEnvironment(), stdio: ["ignore", "pipe", "pipe"] })
      let timedOut = false, stdoutTruncated = false, stderrTruncated = false, out = Buffer.alloc(0), err = Buffer.alloc(0)
      const kill = () => child.kill("SIGKILL")
      const retain = (stream: "stdout" | "stderr", chunk: Buffer) => { const keep = Math.max(0, request.maxOutputBytes - out.length - err.length); if (stream === "stdout") out = Buffer.concat([out, chunk.subarray(0, keep)]); else err = Buffer.concat([err, chunk.subarray(0, keep)]); if (chunk.length > keep) { if (stream === "stdout") stdoutTruncated = true; else stderrTruncated = true; kill() } }
      child.stdout.on("data", (chunk: Buffer) => retain("stdout", chunk)); child.stderr.on("data", (chunk: Buffer) => retain("stderr", chunk))
      const timer = setTimeout(() => { timedOut = true; kill() }, request.timeoutMs)
      let exitCode: number | null
      try { exitCode = await new Promise((resolve, reject) => { child.once("error", reject); child.once("close", resolve) }) } finally { clearTimeout(timer); kill() }
      return { exitCode: timedOut ? null : exitCode, timedOut, stdout: out.toString("utf8"), stderr: err.toString("utf8"), stdoutTruncated, stderrTruncated, durationMs: Date.now() - started, pid: child.pid ?? null, securityReport: { sandboxAvailable: true, sandboxBackend: BACKEND, networkAllowed: false, filesystemMode: "PRIVATE_TEMP_ONLY", timeoutMs: request.timeoutMs, outputLimitBytes: request.maxOutputBytes, blockedReason: null, executionPolicyVersion: policy.version } }
    } catch { return blockedResult(request, "EXPERIMENT_BLOCKED_SANDBOX_UNAVAILABLE", BACKEND) }
    finally { if (root) await rm(root, { recursive: true, force: true }) }
  }
}
