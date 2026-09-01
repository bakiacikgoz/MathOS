import type { DeclarationKind, DeclarationOrigin, LeanDeclaration } from "./types.ts"

const DECL_RE =
  /^(?:(?:noncomputable|protected|private|scoped|public|unsafe)\s+)*(theorem|lemma|def|axiom|abbrev|instance|example)\s+([A-Za-z_][\w'.]*)/

const ATTR_RE = /^@\[.*\]/

export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length > 1)
}

export function parseLeanDeclarations(
  source: string,
  options: { origin: DeclarationOrigin; module?: string; file?: string },
): LeanDeclaration[] {
  const found: LeanDeclaration[] = []
  let currentNs = ""
  let pendingAttrs: string[] = []
  const lines = source.split(/\r?\n/)
  for (let li = 0; li < lines.length; li += 1) {
    const line = lines[li]!.trim()
    if (!line) continue

    const ns = line.match(/^namespace\s+(\S+)/)
    if (ns) {
      currentNs = currentNs ? `${currentNs}.${ns[1]}` : ns[1]!
      pendingAttrs = []
      continue
    }
    if (line === "end" || line.startsWith("end ")) {
      currentNs = currentNs.includes(".") ? currentNs.slice(0, currentNs.lastIndexOf(".")) : ""
      pendingAttrs = []
      continue
    }

    if (ATTR_RE.test(line)) {
      pendingAttrs.push(line)
      continue
    }

    const match = DECL_RE.exec(line)
    if (!match) {
      if (!ATTR_RE.test(line)) pendingAttrs = []
      continue
    }

    const kind = mapKind(match[1]!)
    const shortName = match[2]!
    const inferredNs = currentNs || namespaceFromModule(options.module)
    const name = inferredNs && !shortName.includes(".") ? `${inferredNs}.${shortName}` : shortName
    const fullLine = [...pendingAttrs, line].join(" ").replace(/\s+/g, " ").slice(0, 280)
    found.push({
      name,
      kind,
      signature: fullLine,
      module: options.module,
      source: options.file,
      namespace: currentNs || undefined,
      origin: options.origin,
      unsafeForRelease: kind === "axiom" || /\bunsafe\b/.test(fullLine),
    })
    pendingAttrs = []
  }
  return found
}

function mapKind(value: string): DeclarationKind {
  if (value === "theorem" || value === "lemma" || value === "def" || value === "axiom") return value
  if (value === "abbrev" || value === "instance") return "def"
  return "other"
}

function namespaceFromModule(module?: string): string | undefined {
  if (!module) return undefined
  const parts = module.split(".").filter((part) => /^[A-Z]/.test(part) && part !== "Mathlib")
  return parts.at(-2) ?? parts.at(-1)
}

export function moduleFromPath(file: string, rootMarker = "Mathlib"): string | undefined {
  const normalized = file.replaceAll("\\", "/")
  const idx = normalized.lastIndexOf(`/${rootMarker}/`)
  if (idx === -1) {
    const formal = normalized.lastIndexOf("/formal/")
    if (formal === -1) {
      const init = normalized.lastIndexOf("/Init/")
      if (init === -1) return undefined
      return normalized
        .slice(init + 1)
        .replace(/\.lean$/, "")
        .replaceAll("/", ".")
    }
    return normalized
      .slice(formal + "/formal/".length)
      .replace(/\.lean$/, "")
      .replaceAll("/", ".")
  }
  return normalized
    .slice(idx + 1)
    .replace(/\.lean$/, "")
    .replaceAll("/", ".")
}

export function extractUnknownIdentifiers(diagnostics: string): string[] {
  const names = new Set<string>()
  const patterns = [
    /unknown identifier ['`]([^'`]+)['`]/gi,
    /unknown constant ['`]([^'`]+)['`]/gi,
    /invalid field ['`]([^'`]+)['`]/gi,
  ]
  for (const pattern of patterns) {
    for (const match of diagnostics.matchAll(pattern)) {
      if (match[1]) names.add(match[1])
    }
  }
  return [...names]
}
