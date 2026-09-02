import { basename, isAbsolute } from "node:path"
export interface BwrapCommandInput { backend: string; executable: string; scriptName: string; sandboxRoot: string; timeoutMs: number; maxOutputBytes: number }
export function buildBwrapCommand(input: BwrapCommandInput): string[] {
  if (basename(input.scriptName) !== input.scriptName || input.scriptName.includes("..") || input.scriptName.includes("/") || input.scriptName.includes("\\")) throw new Error("SANDBOX_PATH_UNSAFE")
  if (!isAbsolute(input.sandboxRoot)) throw new Error("SANDBOX_ROOT_NOT_ABSOLUTE")
  return [input.backend, "--unshare-user", "--unshare-pid", "--unshare-ipc", "--unshare-net", "--die-with-parent", "--new-session", "--ro-bind", "/usr", "/usr", "--ro-bind-try", "/lib", "/lib", "--ro-bind-try", "/lib64", "/lib64", "--proc", "/proc", "--dev", "/dev", "--tmpfs", "/tmp", "--dir", "/home/mathos", "--bind", input.sandboxRoot, "/work", "--chdir", "/work", "--clearenv", "--setenv", "HOME", "/home/mathos", "--setenv", "PATH", "/usr/bin:/bin", input.executable, `/work/${input.scriptName}`]
}
