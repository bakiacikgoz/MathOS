import type { ResearchDraft } from "@mathos/domain"

export function formatDraft(draft: ResearchDraft): string {
  const objects = draft.objects.length
    ? draft.objects.map((item) => `  ${item.name.padEnd(8)} ${item.description}`).join("\n")
    : "  none"
  const assumptions = draft.assumptions.length
    ? draft.assumptions.map((item) => `  ${item.id}  ${item.text}`).join("\n")
    : "  none"
  const ambiguities = draft.ambiguities.length
    ? draft.ambiguities.map((item) => `  ${item.id}  ${item.question}`).join("\n")
    : "  none"
  return [
    "RESEARCH DRAFT",
    "",
    "TYPE",
    `  ${draft.kind}`,
    "",
    "TITLE",
    `  ${draft.title}`,
    "",
    "STATEMENT",
    `  ${draft.normalizedStatement}`,
    "",
    "OBJECTS",
    objects,
    "",
    "ASSUMPTIONS",
    assumptions,
    "",
    "GOAL",
    `  ${draft.goal ?? "—"}`,
    "",
    "AMBIGUITIES",
    ambiguities,
    "",
    "STATUS",
    `  ${draft.suggestedStatus}`,
  ].join("\n")
}
