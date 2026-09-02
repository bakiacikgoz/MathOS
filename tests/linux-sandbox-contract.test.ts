import { describe, expect, test } from "bun:test"
import { buildBwrapCommand } from "@mathos/computation"

describe("Linux bwrap isolation contract", () => {
  test("uses private namespaces, no host home/workspace, and bounded writable directory", () => {
    const command = buildBwrapCommand({ backend: "/usr/bin/bwrap", executable: "/usr/bin/python3", scriptName: "job.py", sandboxRoot: "/tmp/mathos-job", timeoutMs: 1000, maxOutputBytes: 4096 })
    const text = command.join(" ")
    for (const flag of ["--unshare-user", "--unshare-pid", "--unshare-ipc", "--unshare-net", "--die-with-parent", "--new-session", "--proc /proc", "--tmpfs /tmp", "--dir /home/mathos", "--chdir /work"]) expect(text).toContain(flag)
    expect(text).not.toContain(process.env.HOME ?? "impossible-home")
  })
  test("rejects unsafe script names", () => {
    expect(() => buildBwrapCommand({ backend: "bwrap", executable: "python3", scriptName: "../job.py", sandboxRoot: "/tmp/x", timeoutMs: 1, maxOutputBytes: 1 })).toThrow("SANDBOX_PATH_UNSAFE")
  })
})
