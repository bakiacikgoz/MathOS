import { openSync, closeSync, readSync } from "node:fs"

export async function readSecretInput(prompt = "Secret: "): Promise<string> {
  if (process.platform === "win32") return readWindowsSecret(prompt)
  let fd: number | null = null
  try {
    fd = openSync("/dev/tty", "r+")
    Bun.write(Bun.stdout, prompt)
    const off = Bun.spawnSync(["stty", "-echo"], { stdin: fd, stdout: "ignore", stderr: "ignore" })
    if (off.exitCode !== 0) throw new Error("SECRET_TTY_ECHO_CONTROL_FAILED")
    const bytes: number[] = [], buffer = Buffer.alloc(1)
    while (readSync(fd, buffer, 0, 1, null) === 1 && buffer[0] !== 10 && buffer[0] !== 13) bytes.push(buffer[0]!)
    process.stdout.write("\n")
    const value = Buffer.from(bytes).toString("utf8")
    if (!value) throw new Error("SECRET_VALUE_INVALID")
    return value
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("SECRET_")) throw error
    throw new Error("SECRET_INTERACTIVE_TTY_REQUIRED")
  } finally {
    if (fd !== null) { Bun.spawnSync(["stty", "echo"], { stdin: fd, stdout: "ignore", stderr: "ignore" }); closeSync(fd) }
  }
}

async function readWindowsSecret(prompt: string): Promise<string> {
  if (!process.stdin.isTTY) throw new Error("SECRET_INTERACTIVE_TTY_REQUIRED")
  process.stdout.write(prompt); process.stdin.setRawMode?.(true); process.stdin.resume()
  try { return await new Promise<string>((resolve, reject) => { let value = ""; const onData = (chunk: Buffer) => { for (const byte of chunk) { if (byte === 3) { cleanup(); reject(new Error("SECRET_INPUT_CANCELLED")); return } if (byte === 13) { cleanup(); process.stdout.write("\n"); value ? resolve(value) : reject(new Error("SECRET_VALUE_INVALID")); return } if (byte === 8 || byte === 127) value = value.slice(0, -1); else if (byte >= 32) value += String.fromCharCode(byte) } }; const cleanup = () => process.stdin.off("data", onData); process.stdin.on("data", onData) }) } finally { process.stdin.setRawMode?.(false); process.stdin.pause() }
}
