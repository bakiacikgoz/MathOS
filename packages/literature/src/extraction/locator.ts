import type { SourceLocator } from "@mathos/domain"

export function sameLocator(left: SourceLocator | null, right: SourceLocator | null): boolean {
  return JSON.stringify(left ?? null) === JSON.stringify(right ?? null)
}
