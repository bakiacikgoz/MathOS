import { inspectLeanSignature, inspectLeanSource, type LeanGoalInspection } from "@mathos/lean"
import type { CandidateProfile, GoalProfile, LeanDeclaration } from "./types.ts"

export function toGoalProfile(inspection: LeanGoalInspection): GoalProfile {
  return {
    rawTarget: inspection.rawTarget,
    propositionHead: inspection.propositionHead,
    constants: inspection.constants,
    namespaces: inspection.namespaces,
    typeConstructors: inspection.typeConstructors,
    operators: inspection.operators,
    localTypes: inspection.localTypes,
    conclusionTokens: inspection.conclusionTokens,
    isEquality: inspection.isEquality,
    isIff: inspection.isIff,
    isImplication: inspection.isImplication,
    isExistential: inspection.isExistential,
    isUniversal: inspection.isUniversal,
    operatorMultiplicity: operatorMultiplicity(inspection.rawTarget),
    known: inspection.known,
  }
}

export function profileGoal(source: string): GoalProfile {
  return toGoalProfile(inspectLeanSource(source))
}

export function profileCandidate(declaration: LeanDeclaration): CandidateProfile {
  const inspected = inspectLeanSignature(declaration.name, declaration.signature)
  return {
    declarationName: declaration.name,
    conclusionHead: inspected.propositionHead,
    constants: inspected.constants,
    namespaces: inspected.namespaces.length ? inspected.namespaces : declaration.namespace ? [declaration.namespace.toLowerCase()] : [],
    typeConstructors: inspected.typeConstructors,
    isEquality: inspected.isEquality,
    isIff: inspected.isIff,
    isImplication: inspected.isImplication,
    origin: declaration.origin === "workspace" ? "workspace" : declaration.module?.startsWith("Init.") ? "lean-core" : "mathlib",
    known: inspected.known,
  }
}

export function signatureFingerprint(declaration: LeanDeclaration): string {
  const profile = profileCandidate(declaration)
  return `${profile.conclusionHead ?? "?"}|${profile.constants.slice(0, 6).sort().join(",")}|${declaration.name.split(".").at(-1)}`
}

function operatorMultiplicity(source: string): Record<string, number> {
  const count = (pattern: RegExp) => source.match(pattern)?.length ?? 0
  return {
    neg: count(/-(?=\s*-|\s*[A-Za-z_(])/g),
    eq: count(/(?<![<>=!])=(?!=)/g),
    iff: count(/↔/g),
    union: count(/∪/g),
    inter: count(/∩/g),
    subset: count(/⊆/g),
    le: count(/≤/g),
  }
}
