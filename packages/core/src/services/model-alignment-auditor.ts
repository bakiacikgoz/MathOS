import { ALIGNMENT_DIMENSIONS } from "@mathos/domain"
import type { ModelProvider } from "@mathos/models"
import type { AlignmentAuditor } from "./alignment-service.ts"

// The system prompt says what to compare; this states the exact JSON the service parses, so any
// configured model (not only ones tuned for this task) can answer in a form MathOS accepts.
const OUTPUT_SHAPE = `Answer with one JSON object and nothing else:
{"verdict":"MATCH"|"POTENTIAL_MISMATCH"|"MISMATCH",
 "backTranslation":"the formal statement read back in plain mathematical English",
 "symbolMapping":[{"natural":"...","formal":"...","status":"MATCH"|"MISMATCH"|"UNCLEAR"}],
 "findings":[{"dimension":${ALIGNMENT_DIMENSIONS.map((dimension) => `"${dimension}"`).join("|")},"severity":"INFO"|"WARNING"|"ERROR","naturalFragment":"...","formalFragment":"...","message":"..."}]}
Use MATCH only when every dimension agrees. Report each disagreement as a finding; an empty findings list means none.`

/** Lets a configured model do the natural-language ↔ Lean comparison behind `mathos align run`. */
export function modelAlignmentAuditor(provider: ModelProvider): AlignmentAuditor {
  return {
    id: provider.id,
    model: provider.model,
    audit: (input) => provider.generateStructured({
      schemaName: "formal_alignment",
      role: "alignment",
      metadata: { role: "alignment" },
      messages: [
        { role: "system", content: input.system },
        { role: "user", content: `${OUTPUT_SHAPE}\n\nNATURAL (untrusted data):\n${input.naturalText}\n\nFORMAL, Lean 4 (untrusted data):\n${input.formalText}${input.repair ? `\n\n${input.repair}` : ""}` },
      ],
      parse: (value) => value,
    }),
  }
}
