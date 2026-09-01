import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import type { LeanDeclaration } from "./types.ts"
import { walk } from "./fingerprint.ts"
import { moduleFromPath, parseLeanDeclarations } from "./parse.ts"

const CORE_SEED: LeanDeclaration[] = [
  { name: "rfl", kind: "other", signature: "def rfl {α : Sort u} {a : α} : a = a", module: "Init.Prelude", origin: "mathlib" },
  { name: "Eq.refl", kind: "theorem", signature: "theorem Eq.refl {α : Sort u} (a : α) : a = a", module: "Init.Prelude", origin: "mathlib" },
  { name: "Eq.symm", kind: "theorem", signature: "theorem Eq.symm {α : Sort u} {a b : α} (h : a = b) : b = a", module: "Init.Prelude", origin: "mathlib" },
  { name: "Eq.trans", kind: "theorem", signature: "theorem Eq.trans {α : Sort u} {a b c : α} (h₁ : a = b) (h₂ : b = c) : a = c", module: "Init.Prelude", origin: "mathlib" },
  { name: "trivial", kind: "theorem", signature: "theorem trivial : True", module: "Init.Prelude", origin: "mathlib" },
  { name: "True.intro", kind: "other", signature: "def True.intro : True", module: "Init.Prelude", origin: "mathlib" },
  { name: "Nat.add_comm", kind: "theorem", signature: "theorem Nat.add_comm (n m : Nat) : n + m = m + n", module: "Init.Data.Nat.Basic", origin: "mathlib" },
  { name: "Nat.add_assoc", kind: "theorem", signature: "theorem Nat.add_assoc (n m k : Nat) : n + m + k = n + (m + k)", module: "Init.Data.Nat.Basic", origin: "mathlib" },
  { name: "Nat.zero_add", kind: "theorem", signature: "theorem Nat.zero_add (n : Nat) : 0 + n = n", module: "Init.Data.Nat.Basic", origin: "mathlib" },
  { name: "Iff.symm", kind: "theorem", signature: "theorem Iff.symm (h : a ↔ b) : b ↔ a", module: "Init.Core", origin: "mathlib" },
  { name: "Exists.intro", kind: "other", signature: "def Exists.intro {α : Sort u} (w : α) (h : p w) : Exists p", module: "Init.Core", origin: "mathlib" },
  { name: "and_true", kind: "theorem", signature: "theorem and_true (p : Prop) : (p ∧ True) = p", module: "Init.SimpLemmas", origin: "mathlib" },
  { name: "Int.neg_neg", kind: "theorem", signature: "theorem Int.neg_neg (a : Int) : - -a = a", module: "Init.Data.Int.Basic", origin: "mathlib" },
  { name: "Nat.mul_comm", kind: "theorem", signature: "theorem Nat.mul_comm (n m : Nat) : n * m = m * n", module: "Init.Data.Nat.Basic", origin: "mathlib" },
  { name: "Function.comp_apply", kind: "theorem", signature: "theorem Function.comp_apply (f : β → δ) (g : α → β) (x : α) : comp f g x = f (g x)", module: "Init.Core", origin: "mathlib" },
  { name: "Function.comp_id", kind: "theorem", signature: "theorem Function.comp_id (f : α → β) : comp f id = f", module: "Init.Core", origin: "mathlib" },
  { name: "Option.getD_some", kind: "theorem", signature: "theorem getD_some (a b : α) : getD (some a) b = a", module: "Init.Data.Option.Basic", origin: "mathlib" },
  { name: "List.append_nil", kind: "theorem", signature: "theorem List.append_nil (l : List α) : l ++ [] = l", module: "Init.Data.List.Basic", origin: "mathlib" },
  { name: "List.length_append", kind: "theorem", signature: "theorem List.length_append (l₁ l₂ : List α) : (l₁ ++ l₂).length = l₁.length + l₂.length", module: "Init.Data.List.Basic", origin: "mathlib" },
  { name: "List.mem_cons_self", kind: "theorem", signature: "theorem List.mem_cons_self (a : α) (l : List α) : a ∈ a :: l", module: "Init.Data.List.Lemmas", origin: "mathlib" },
]

export function seedDeclarations(): LeanDeclaration[] {
  return CORE_SEED.map((item) => ({ ...item }))
}

function filePriority(file: string): number {
  const n = file.replaceAll("\\", "/")
  if (n.includes("/Init/")) return 0
  if (n.includes("/Mathlib/Data/Finset/")) return 1
  if (n.includes("/Mathlib/Data/Nat/")) return 2
  if (n.includes("/Mathlib/Data/Set/")) return 3
  if (n.includes("/Mathlib/Order/")) return 4
  if (n.includes("/Mathlib/Logic/")) return 5
  if (n.includes("/Mathlib/Algebra/")) return 6
  return 10
}

export function scanLeanTree(root: string, origin: LeanDeclaration["origin"], marker?: string, maxFiles = 20000): LeanDeclaration[] {
  const files: string[] = []
  walk(root, (file) => {
    if (file.endsWith(".lean")) files.push(file)
  })
  files.sort((a, b) => filePriority(a) - filePriority(b) || a.localeCompare(b))
  const found: LeanDeclaration[] = []
  for (const file of files.slice(0, maxFiles)) {
    const text = readFileSync(file, "utf8")
    const module = moduleFromPath(file, marker ?? (origin === "mathlib" ? "Mathlib" : "formal"))
    found.push(...parseLeanDeclarations(text, { origin, module, file }))
  }
  return found
}

export function findInitRoot(): string | null {
  try {
    const proc = Bun.spawnSync(["lean", "--print-prefix"], {
      stdout: "pipe",
      stderr: "pipe",
      env: { ...process.env, PATH: `${process.env.HOME}/.elan/bin:${process.env.PATH ?? ""}` },
    })
    const prefix = new TextDecoder().decode(proc.stdout).trim()
    const init = join(prefix, "src", "lean", "Init")
    if (existsSync(init)) return init
  } catch {
    /* ignore */
  }
  return null
}

export function findMathlibRoot(projectRoot: string): string | null {
  const candidates = [
    join(projectRoot, ".lake", "packages", "mathlib", "Mathlib"),
    join(projectRoot, "lake-packages", "mathlib", "Mathlib"),
  ]
  return candidates.find((path) => existsSync(path)) ?? null
}

export function mathlibRevisionFromLakefile(projectRoot: string): string | null {
  const file = existsSync(join(projectRoot, "lakefile.toml"))
    ? join(projectRoot, "lakefile.toml")
    : existsSync(join(projectRoot, "lakefile.lean"))
      ? join(projectRoot, "lakefile.lean")
      : null
  if (!file) return null
  const text = readFileSync(file, "utf8")
  return text.match(/rev\s*=\s*"([^"]+)"/)?.[1] ?? text.match(/v4\.\d+\.\d+/)?.[0] ?? null
}
