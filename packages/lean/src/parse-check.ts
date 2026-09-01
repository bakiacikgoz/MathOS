import type { LeanDeclarationInspection } from "./declaration.ts"
import { inspectLeanSignature, splitConclusion } from "./inspect.ts"

export function parseCheckOutput(names: string[], output: string): LeanDeclarationInspection[] {
  const lines = output.split(/\r?\n/)
  return names.map((name) => parseOne(name, output, lines))
}

function parseOne(name: string, output: string, lines: string[]): LeanDeclarationInspection {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  const unknown = new RegExp(`unknown (?:identifier|constant) ['\`]${escaped}['\`]`, "i").test(output)
  if (unknown) {
    return empty(name, false, [{ severity: "error", message: `unknown identifier '${name}'` }])
  }

  const typeLine = findTypeLine(name, lines)
  if (!typeLine) {
    const hasError = /error:/i.test(output)
    return empty(name, !hasError, hasError ? [{ severity: "error", message: output.slice(0, 240) }] : [])
  }

  const type = stripCheckPrefix(typeLine, name)
  const inspected = inspectLeanSignature(name, type)
  const { conclusion } = splitConclusion(type)
  return {
    name,
    exists: true,
    type,
    normalizedType: type.replace(/\s+/g, " ").trim(),
    namespace: name.includes(".") ? name.split(".")[0] : undefined,
    constants: inspected.constants,
    typeConstructors: inspected.typeConstructors,
    conclusion: conclusion ?? inspected.rawTarget,
    propositionShape: {
      equality: inspected.isEquality,
      iff: inspected.isIff,
      implication: inspected.isImplication,
      existential: inspected.isExistential,
      universal: inspected.isUniversal,
      inequality: inspected.operators.includes("le") || inspected.operators.includes("subset"),
    },
    diagnostics: [],
    elaborated: true,
  }
}

function findTypeLine(name: string, lines: string[]): string | undefined {
  const suffix = name.split(".").at(-1) ?? name
  const candidates = lines.filter((line) => {
    const trimmed = line.replace(/^info:\s*/i, "").trim()
    return trimmed.startsWith(`${name}`) || trimmed.startsWith(`${name}.{`) || trimmed.startsWith(`${suffix} `) || trimmed.startsWith(`${suffix}.{`)
  })
  return candidates.find((line) => line.includes(" : ")) ?? candidates[0]
}

function stripCheckPrefix(line: string, name: string): string {
  return line.replace(/^info:\s*/i, "").replace(new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?:\\.\\{[^}]+\\})?\\s*`), `${name} `).trim()
}

function empty(name: string, exists: boolean, diagnostics: LeanDeclarationInspection["diagnostics"]): LeanDeclarationInspection {
  return {
    name,
    exists,
    constants: [],
    typeConstructors: [],
    diagnostics,
    elaborated: false,
  }
}
