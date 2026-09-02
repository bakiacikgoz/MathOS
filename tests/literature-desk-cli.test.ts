import { describe, expect, test } from "bun:test"
import { literatureDeskCommand, literatureDeskSnapshot } from "../apps/tui/src/ui/LiteratureDeskViews.tsx"

describe("literature desk CLI contract", () => {
  test("routes additive import, BibTeX, search, pages, review, and assessment actions", () => {
    expect(literatureDeskCommand(["import", "plan", "paper.pdf"]).action).toBe("IMPORT_PLAN")
    expect(literatureDeskCommand(["import", "apply", "plan.json"]).action).toBe("IMPORT_APPLY")
    expect(literatureDeskCommand(["bib", "import", "refs.bib"]).action).toBe("BIB_IMPORT")
    expect(literatureDeskCommand(["search", "fixed", "point"]).action).toBe("SEARCH")
    expect(literatureDeskCommand(["pages", "SRC-1"]).action).toBe("PAGES")
    expect(literatureDeskCommand(["review", "XC-1", "accept"]).action).toBe("REVIEW")
    expect(literatureDeskCommand(["assess", "CLM-1", "SRC-1"]).action).toBe("ASSESS")
  })
  test("desk snapshot never presents external material as proof", () => {
    expect(literatureDeskSnapshot({ sources: [], excerpts: [], candidates: [], assessments: [] }).trustBanner).toBe("EXTERNAL RESULTS — NOT A PROOF")
  })
})
