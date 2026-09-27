import { inspectSandbox, SANDBOX_IMAGE } from "@mathos/computation"
import { listJobs, startJob } from "./jobs.ts"

// On macOS and Windows, experiments run in a locked-down Docker container. Docker itself is the user's to install
// and start; once it runs, the pinned image is fetched here in the background so experiments work without a setup step.

async function exitCode(argv: string[]): Promise<number> {
  try { return await Bun.spawn(argv, { stdin: "ignore", stdout: "ignore", stderr: "ignore" }).exited } catch { return -1 }
}

/** Called when the desktop host starts: pulls the sandbox image when Docker is running and the image is missing. */
export async function autoPullSandboxImage(env: Record<string, string | undefined> = process.env): Promise<string | null> {
  if (env.MATHOS_SANDBOX_AUTO_PULL === "0" || process.platform === "linux") return null
  const docker = Bun.which("docker")
  if (!docker || await exitCode([docker, "info", "--format", "{{.ServerVersion}}"]) !== 0) return null
  if (await exitCode([docker, "image", "inspect", SANDBOX_IMAGE]) === 0) return null
  return startJob("sandbox-image", "sandbox-image", async (emit, signal) => {
    const proc = Bun.spawn([docker, "pull", SANDBOX_IMAGE], { stdin: "ignore", stdout: "pipe", stderr: "pipe" })
    signal.addEventListener("abort", () => proc.kill())
    for await (const chunk of proc.stdout) emit({ type: "log", line: new TextDecoder().decode(chunk).trim().slice(0, 300) })
    const code = await proc.exited
    if (code !== 0) throw new Error(`SANDBOX_IMAGE_PULL_FAILED: ${(await new Response(proc.stderr).text()).trim().slice(0, 300)}`)
    return { image: SANDBOX_IMAGE }
  }).id
}

/** Where the experiment sandbox stands, for setup: Docker installed, running, the image present or being fetched. */
export async function sandboxState() {
  const needsDocker = process.platform !== "linux"
  const docker = Bun.which("docker")
  const running = Boolean(docker) && await exitCode([docker!, "info", "--format", "{{.ServerVersion}}"]) === 0
  const image = running && await exitCode([docker!, "image", "inspect", SANDBOX_IMAGE]) === 0
  const pulling = listJobs("sandbox-image").find((job) => job.state === "running")?.id ?? null
  const lastError = listJobs("sandbox-image").filter((job) => job.state === "failed").sort((a, b) => b.startedAt - a.startedAt)[0]?.error ?? null
  const available = needsDocker ? running && image : (await inspectSandbox()).available
  return { needsDocker, docker: !docker ? "missing" as const : running ? "running" as const : "stopped" as const, image, pulling, lastError, available }
}
