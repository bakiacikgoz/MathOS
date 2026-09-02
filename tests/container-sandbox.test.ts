import { expect, test } from "bun:test"
import { ContainerSandboxRuntime, dockerRunArguments } from "@mathos/computation"

test("container sandbox denies network and constrains process and filesystem", () => {
  const args = dockerRunArguments("/tmp/mathos")
  expect(args).toContain("none")
  expect(args).toContain("--read-only")
  expect(args).toContain("ALL")
  expect(args).toContain("no-new-privileges")
  expect(args).toContain("--pids-limit")
  expect(args).toContain("--memory")
  expect(args).toContain("--cpus")
  expect(args).toContain("65534:65534")
  expect(args.join(" ")).not.toMatch(/OPENAI|OPENROUTER|API_KEY|SSH_AUTH_SOCK/)
})

test("container sandbox fails closed when Docker is unavailable", async () => {
  if (Bun.which("docker")) return
  const capability = await new ContainerSandboxRuntime().inspect()
  expect(capability.available).toBe(false)
  expect(capability.reason).toContain("SANDBOX_UNAVAILABLE")
})
