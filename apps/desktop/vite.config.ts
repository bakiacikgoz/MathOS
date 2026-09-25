import { defineConfig, type Plugin } from "vite"
import react from "@vitejs/plugin-react"
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process"
import { resolve } from "node:path"

const repoRoot = resolve(__dirname, "../..")

/**
 * Browser-only development bridge. Inside Tauri the Rust side owns the host
 * process; in a plain browser (`bun run dev`) this middleware does the same job
 * on loopback so the UI can be developed and tested without a native build.
 */
function mathosDevBridge(): Plugin {
  let host: ChildProcessWithoutNullStreams | null = null
  let seq = 0
  const pending = new Map<string, (value: unknown) => void>()
  const ensure = () => {
    // A host killed by a signal has exitCode null but signalCode set; both mean it is gone.
    if (host && host.exitCode === null && host.signalCode === null) return host
    host = spawn(process.env.MATHOS_BUN ?? "bun", [resolve(repoRoot, "apps/desktop/host/host.ts")], { cwd: repoRoot, stdio: ["pipe", "pipe", "pipe"] })
    let buffer = ""
    host.stdout.setEncoding("utf8").on("data", (chunk: string) => {
      buffer += chunk
      let index: number
      while ((index = buffer.indexOf("\n")) !== -1) {
        const line = buffer.slice(0, index); buffer = buffer.slice(index + 1)
        try { const row = JSON.parse(line); if (row.id && pending.has(row.id)) { pending.get(row.id)!(row); pending.delete(row.id) } } catch {}
      }
    })
    host.stderr.setEncoding("utf8").on("data", (chunk: string) => process.stderr.write(`[mathos-host] ${chunk}`))
    host.on("exit", () => { for (const [id, resolveRow] of pending) resolveRow({ id, code: 1, stdout: "", stderr: "DESKTOP_HOST_EXITED\n", ms: 0 }); pending.clear() })
    return host
  }
  return {
    name: "mathos-dev-bridge",
    apply: "serve",
    configureServer(server) {
      const forward = (message: Record<string, unknown>, res: import("node:http").ServerResponse) => {
        const id = String(++seq)
        pending.set(id, (row) => { res.setHeader("content-type", "application/json"); res.end(JSON.stringify(row)) })
        ensure().stdin.write(`${JSON.stringify({ ...message, id })}\n`)
      }
      // Keys go to the host over stdin, exactly like the Tauri path; the host validates the message.
      server.middlewares.use("/__mathos/secret", (req, res) => {
        if (req.method !== "POST") { res.statusCode = 405; res.end(); return }
        let body = ""
        req.setEncoding("utf8").on("data", (chunk: string) => { body += chunk }).on("end", () => {
          try { const { ref, value } = JSON.parse(body) as { ref: string; value: string }; forward({ op: "secret-set", ref, value }, res) }
          catch { res.statusCode = 400; res.end("DESKTOP_BRIDGE_REQUEST_INVALID") }
        })
      })
      server.middlewares.use("/__mathos/exec", (req, res) => {
        if (req.method !== "POST") { res.statusCode = 405; res.end(); return }
        let body = ""
        req.setEncoding("utf8").on("data", (chunk: string) => { body += chunk }).on("end", () => {
          try {
            const { cwd, args } = JSON.parse(body) as { cwd: string; args: string[] }
            const id = String(++seq)
            pending.set(id, (row) => { res.setHeader("content-type", "application/json"); res.end(JSON.stringify(row)) })
            ensure().stdin.write(`${JSON.stringify({ id, cwd, args })}\n`)
          } catch (error) { res.statusCode = 400; res.end(String(error)) }
        })
      })
      server.httpServer?.on("close", () => host?.kill())
    },
  }
}

export default defineConfig({
  plugins: [react(), mathosDevBridge()],
  clearScreen: false,
  server: { port: 1420, strictPort: true, host: "127.0.0.1", watch: { ignored: ["**/src-tauri/**"] } },
  envPrefix: ["VITE_", "TAURI_ENV_"],
  build: {
    target: process.env.TAURI_ENV_PLATFORM === "windows" ? "chrome105" : "safari15",
    minify: "esbuild",
    cssMinify: true,
    sourcemap: false,
    chunkSizeWarningLimit: 800,
  },
})
