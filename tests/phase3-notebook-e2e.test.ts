import { expect, test } from "bun:test"
import { mkdtempSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { MathOS } from "@mathos/core"
import { exportBlueprintLatex, parseMathosMarkdown } from "@mathos/notebook"

test("fresh workspace context + notebook + claim reference + export + reopen", async () => {
  const root=mkdtempSync(join(tmpdir(),"mathos-phase3-"));await MathOS.init(root)
  let app=MathOS.open(root);const claim=app.createClaim({kind:"lemma",title:"Referenced lemma",statement:"A lemma"}),branch=app.currentBranch()
  const context=app.services.mathematicalContext.proposeItem({workspaceId:branch.workspaceId,branchId:branch.id,scopeKind:"CLAIM",scopeId:claim.id,draft:{kind:"SYMBOL",canonicalName:"x",displayText:"x",normalizedValue:"x",origin:"USER"}});app.services.mathematicalContext.applyProposal(context.id,context.revision)
  const source=`# Research\n\n:::claim-ref id="${claim.id}"\nReferenced lemma.\n:::\n`;const created=app.services.researchNotebook.create({id:"D-001",workspaceId:branch.workspaceId,branchId:branch.id,title:"Research",slug:"research",sourcePath:"notebooks/research.mathos.md",content:source})
  expect(created.projectionStatus).toBe("HEALTHY");app.close()
  app=MathOS.open(root);const document=app.services.repositories.researchDocuments.get("D-001")!,raw=app.services.repositories.researchBlocks.list(document.id,{limit:100}).map((block)=>block.markdown).join("")
  expect(raw).toBe(source);expect(exportBlueprintLatex(parseMathosMarkdown(raw))).toContain(`\\label{${claim.id}}`);expect(readFileSync(join(root,document.sourcePath),"utf8")).toBe(source);app.close()
})
