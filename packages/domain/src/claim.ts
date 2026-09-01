import { InvalidClaimInput, InvalidClaimKind } from "@mathos/shared"
import { claimPrefix, type ClaimKind, isClaimKind } from "./model.ts"

export function parseClaimKind(value: string): ClaimKind {
  const normalized = value.trim().toLowerCase()
  if (!isClaimKind(normalized)) {
    throw new InvalidClaimKind(value)
  }
  return normalized
}

export function validateClaimDraft(input: {
  kind: string
  title: string
  statement: string
}): { kind: ClaimKind; title: string; statement: string } {
  const kind = parseClaimKind(input.kind)
  const title = input.title.trim()
  const statement = input.statement.trim()
  if (!title) {
    throw new InvalidClaimInput("Title is required.")
  }
  if (!statement) {
    throw new InvalidClaimInput("Statement is required.")
  }
  return { kind, title, statement }
}

export function nextClaimId(existingIds: string[], kind: ClaimKind, pad: (n: number) => string): string {
  const prefix = claimPrefix(kind)
  const pattern = new RegExp(`^${prefix}-(\\d+)$`)
  let max = 0
  for (const id of existingIds) {
    const match = pattern.exec(id)
    if (!match) continue
    const value = Number(match[1])
    if (Number.isFinite(value) && value > max) max = value
  }
  return `${prefix}-${pad(max + 1)}`
}
