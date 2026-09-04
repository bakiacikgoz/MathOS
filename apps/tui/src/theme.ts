export const theme = {
  background: "#071019",
  surface: "#0b141e",
  surfaceMuted: "#101c28",
  text: "#e8e6e3",
  textMuted: "#8b8a86",
  border: "#24384a",
  accent: "#f2b84b",
  blue: "#58a6ff",
  violet: "#b18cff",
  cyan: "#43d4e8",
  accentMuted: "#8a734d",
  danger: "#c45c5c",
  success: "#5db87a",
  warning: "#c47a3a",
  status: {
    idea: "#8b8a86",
    conjecture: "#d4a054",
    informal: "#7aa2c4",
    computational: "#6b9e7a",
    verified: "#5db87a",
    disproved: "#c45c5c",
    blocked: "#c47a3a",
    stale: "#6e6d69",
  },
} as const

export type Theme = typeof theme

export function statusColor(status: string, tokens: Theme = theme): string {
  switch (status) {
    case "KERNEL_VERIFIED":
    case "INDEPENDENTLY_CHECKED":
      return tokens.status.verified
    case "COMPUTATIONALLY_SUPPORTED":
      return tokens.status.computational
    case "INFORMAL_ARGUMENT":
    case "HUMAN_REVIEWED_ARGUMENT":
    case "FORMALIZED_UNVERIFIED":
    case "HEURISTIC_SUPPORT":
      return tokens.status.informal
    case "CONJECTURE":
    case "IDEA":
      return tokens.status.conjecture
    case "DISPROVED":
      return tokens.status.disproved
    case "BLOCKED":
      return tokens.status.blocked
    case "STALE":
      return tokens.status.stale
    default:
      return tokens.textMuted
  }
}

export type LayoutMode = "wide" | "normal" | "compact"

export function layoutMode(width: number): LayoutMode {
  if (width >= 110) return "wide"
  if (width >= 78) return "normal"
  return "compact"
}

export function sidebarWidth(mode: LayoutMode): number {
  if (mode === "wide") return 28
  if (mode === "normal") return 24
  return 0
}
