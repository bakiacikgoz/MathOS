import { expect, test } from "bun:test"
import { environmentWithPath } from "@mathos/shared"

test("on Windows the replaced search path is the only spelling the child sees", () => {
  const env = environmentWithPath("C:\\elan\\bin;C:\\Windows", { Path: "C:\\Windows", SystemRoot: "C:\\Windows" }, "win32")
  expect(Object.keys(env).filter((key) => key.toUpperCase() === "PATH")).toEqual(["PATH"])
  expect(env).toEqual({ SystemRoot: "C:\\Windows", PATH: "C:\\elan\\bin;C:\\Windows" })
})

test("elsewhere names keep their case and only PATH is replaced", () => {
  expect(environmentWithPath("/elan/bin:/usr/bin", { PATH: "/usr/bin", Path: "kept", HOME: "/home/a" }, "linux")).toEqual({ PATH: "/elan/bin:/usr/bin", Path: "kept", HOME: "/home/a" })
})

// Windows PowerShell's Start-Process fails with "Item has already been added" when both spellings arrive.
// Without -Wait: the failure happens before the process starts, and waiting on cmd.exe races its exit.
test.skipIf(process.platform !== "win32")("Windows PowerShell can start a process from the replaced environment", () => {
  const result = Bun.spawnSync(["powershell", "-NoProfile", "-Command", "Start-Process -FilePath cmd.exe -ArgumentList '/c','exit 0' -NoNewWindow; 'started'"], {
    env: environmentWithPath(`C:\\mathos-test;${process.env.PATH ?? ""}`) as Record<string, string>, stdout: "pipe", stderr: "pipe",
  })
  expect(result.stderr.toString()).toBe("")
  expect(result.stdout.toString().trim()).toBe("started")
}, 30_000)
