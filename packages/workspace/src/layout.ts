import { existsSync, mkdirSync, writeFileSync } from "node:fs"
import { basename, join, resolve } from "node:path"
import {
  CONFIG_FILE,
  CHARTER_FILE,
  MATHOS_DIR,
  WORKSPACE_DIRECTORIES,
  WorkspaceAlreadyInitialized,
  WorkspaceNotFound,
} from "@mathos/shared"

export function isWorkspaceRoot(dir: string): boolean {
  return existsSync(join(dir, CONFIG_FILE)) && existsSync(join(dir, MATHOS_DIR))
}

export function findWorkspaceRoot(start = process.cwd()): string {
  let current = resolve(start)
  while (true) {
    if (isWorkspaceRoot(current)) return current
    const parent = resolve(current, "..")
    if (parent === current) {
      throw new WorkspaceNotFound(start)
    }
    current = parent
  }
}

export function tryFindWorkspaceRoot(start = process.cwd()): string | null {
  try {
    return findWorkspaceRoot(start)
  } catch (error) {
    if (error instanceof WorkspaceNotFound) return null
    throw error
  }
}

function charterTemplate(name: string): string {
  return `# Research Charter

## Goal
State the main conjecture or formalization objective for **${name}**.

## Scope
Keep the first campaign bounded. Do not generalize unless requested.

## Allowed assumptions
- Record classical axioms if they appear in a release proof.
- Project-local axioms are forbidden in verified results.
- \`sorry\` may exist only in exploration branches.

## Notation
Define symbols here as they stabilize.

## Formalization policy
Explore informally first.
Formalize stable lemmas.
The main theorem requires kernel verification.

## Research preferences
Prefer conceptual and reusable lemmas over proof golfing.
`
}

function configTemplate(name: string): string {
  return `[project]
name = "${name}"
primary_language = "latex"
proof_assistant = "lean"

[formalization]
mode = "progressive"
require_fidelity_review_for_main_theorem = true

[verification]
forbid_sorry_for_verified = true
audit_axioms = true

[research]
max_active_branches = 8
preserve_failed_branches = true

[privacy]
classification = "private"

[model]
provider = "openai-compatible"
model = ""
base_url = ""

[retrieval]
max_premises = 20
max_context_chars = 6000
candidate_pool = 200
inspect_top_k = 30
generation_per_channel = 100
candidate_union_cap = 800
inspection_timeout_ms = 120000
goal_aware = true
include_unverified_local = false
`
}

const RESEARCH_FILES: Record<string, string> = {
  "research/problem.md": "# Problem\n\nDescribe the main research problem.\n",
  "research/definitions.md": "# Definitions\n\nRecord working definitions here.\n",
  "research/conjectures.md": "# Conjectures\n\nRecord working conjectures here.\n",
}

export interface CreatedWorkspace {
  root: string
  name: string
}

export function createWorkspaceLayout(targetDir: string, name?: string): CreatedWorkspace {
  const root = resolve(targetDir)
  if (isWorkspaceRoot(root) || existsSync(join(root, CONFIG_FILE)) || existsSync(join(root, MATHOS_DIR))) {
    throw new WorkspaceAlreadyInitialized(root)
  }

  const projectName = name ?? (basename(root) || "research")

  mkdirSync(root, { recursive: true })
  for (const dir of WORKSPACE_DIRECTORIES) {
    mkdirSync(join(root, dir), { recursive: true })
  }

  writeFileSync(join(root, CHARTER_FILE), charterTemplate(projectName), "utf8")
  writeFileSync(join(root, CONFIG_FILE), configTemplate(projectName), "utf8")
  writeFileSync(join(root, "README.md"), `# ${projectName}\n\nMathOS research workspace.\n`, "utf8")
  writeFileSync(
    join(root, ".gitignore"),
    `.mathos/tmp/\n.mathos/index/\n.mathos/logs/\n.mathos/sessions/\n.mathos/checkpoints/\n.mathos/worktrees/\n.mathos/*.db\n.mathos/*.db-wal\n.mathos/*.db-shm\n.mathos/debug.log\n.mathos/events.jsonl\nsecrets/\n`,
    "utf8",
  )

  for (const [rel, contents] of Object.entries(RESEARCH_FILES)) {
    writeFileSync(join(root, rel), contents, "utf8")
  }

  return { root, name: projectName }
}

export function requiredPaths(root: string): string[] {
  return [
    join(root, CONFIG_FILE),
    join(root, CHARTER_FILE),
    join(root, MATHOS_DIR),
    join(root, "research"),
    join(root, "formal"),
    join(root, "experiments"),
    join(root, "literature"),
    join(root, "exports"),
  ]
}
