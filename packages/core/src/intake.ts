import { parseResearchDraft, type ResearchDraft } from "@mathos/domain"
import { InvalidClaimInput } from "@mathos/shared"
import type { ModelProvider } from "@mathos/models"
import { ResearchIntakeFailed } from "@mathos/models"
import { INTAKE_SYSTEM_PROMPT } from "./intake-prompt.ts"

export async function runResearchIntake(
  provider: ModelProvider,
  text: string,
  signal?: AbortSignal,
): Promise<ResearchDraft> {
  const input = text.trim()
  if (!input) throw new InvalidClaimInput("Statement text is required.")

  try {
    return await provider.generateStructured({
      schemaName: "research_draft",
      signal,
      messages: [
        { role: "system", content: INTAKE_SYSTEM_PROMPT },
        { role: "user", content: input },
      ],
      parse: (value) =>
        parseResearchDraft(value, input, {
          provider: provider.id,
          model: provider.model,
        }),
    })
  } catch (error) {
    if (error instanceof InvalidClaimInput) throw error
    if (error && typeof error === "object" && "code" in error) throw error
    throw new ResearchIntakeFailed(error instanceof Error ? error.message : "Research intake failed.")
  }
}
