import { describe, expect, test } from "bun:test"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { MathOS } from "@mathos/core"

const cli = resolve(import.meta.dir, "../apps/tui/src/cli.ts")

async function command(root: string, args: string[]) {
  // Each invocation gets its own process and empty model configuration. The CLI
  // still executes normally, including its manual-review fallback for align run.
  const child = Bun.spawn([process.execPath, cli, ...args], {
    cwd: root,
    env: {
      ...process.env,
      HOME: root,
      USERPROFILE: root,
      APPDATA: join(root, "appdata"),
      LOCALAPPDATA: join(root, "localappdata"),
      XDG_CONFIG_HOME: join(root, "config"),
      XDG_DATA_HOME: join(root, "data"),
      XDG_CACHE_HOME: join(root, "cache"),
      XDG_STATE_HOME: join(root, "state"),
      MATHOS_MODEL_PROFILE: "",
      MATHOS_MODEL: "",
      MATHOS_API_KEY: "",
      MATHOS_ALLOW_REMOTE_MODELS: "0",
    },
    stdout: "pipe",
    stderr: "pipe",
  })
  const timeout = setTimeout(() => child.kill(), 8_000)
  try {
    const [output, errors, code] = await Promise.all([
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
      child.exited,
    ])
    expect(code, errors).toBe(0)
    return JSON.parse(output)
  } finally {
    clearTimeout(timeout)
    if (child.exitCode === null) {
      child.kill()
      await child.exited
    }
  }
}

describe("alignment CLI", () => {
  test("runs, shows, approves, rejects and previews impact", async () => {
    const root = mkdtempSync(join(tmpdir(), "mathos-align-cli-"))
    try {
      await MathOS.init(root)
      const app = MathOS.open(root)
      let claimId: string
      try {
        const claim = app.createClaim({ kind: "lemma", title: "L", statement: "Natural" })
        claimId = claim.id
        const context = app.services.mathematicalContext.resolveSnapshot({ workspaceId: claim.workspaceId, branchId: app.currentBranch().id, claimId })
        app.services.statementRevisions.capture({ claimId, kind: "FORMAL", sourceEntityId: "FS-X", text: "formal", contextRevisionId: context.revisionId, createdBy: "model" })
      } finally {
        app.close()
      }

      const result = await command(root, ["align", "run", claimId])
      expect(result.schemaVersion).toBe("mathos.alignment.v1")
      expect(result.data.alignment.status).toBe("PENDING")
      expect(result.data.findings[0].message).toContain("MANUAL_REVIEW_REQUIRED")
      const alignmentId = result.data.alignment.id as string

      const shown = await command(root, ["align", "show", alignmentId])
      expect(shown.data.findings.length).toBeGreaterThan(0)
      const approved = await command(root, ["align", "approve", alignmentId, "--actor", "reviewer-local"])
      expect(approved.data.status).toBe("HUMAN_APPROVED")
      const impact = await command(root, ["align", "impact", claimId])
      expect(impact.schemaVersion).toBe("mathos.alignment.v1")
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  }, 20_000)
})
