import { describe, expect, test } from "bun:test"
import { testRender } from "@opentui/solid"
import { NotebookView, notebookDeepLink, moveNotebookSelection } from "../apps/tui/src/ui/NotebookViews.tsx"
import type { ResearchBlock, ResearchDocument } from "@mathos/domain"

const document:ResearchDocument={ id:"D-1",workspaceId:"W-1",branchId:"B-1",title:"Notes",slug:"notes",format:"MATHOS_MARKDOWN",status:"ACTIVE",sourcePath:"notes.md",revision:1,contentHash:"h",createdAt:"now",updatedAt:"now" }
const block:ResearchBlock={ id:"NB-1",documentId:"D-1",parentBlockId:null,sequence:0,kind:"CLAIM_REF",markdown:"Claim",entityType:"claim-ref",entityId:"C-1",attributes:{},revision:1,contentHash:"h",createdAt:"now",updatedAt:"now" }
describe("notebook TUI", () => {
  test("shows outline, detail, reference state and conflict", async () => {
    const setup=await testRender(()=><NotebookView document={document} blocks={[block]} selected={0} conflict="BOTH_SIDES_CHANGED"/>,{width:90,height:20})
    try{await setup.renderOnce();const frame=setup.captureCharFrame();expect(frame).toContain("NOTEBOOK · Notes");expect(frame).toContain("CLAIM_REF");expect(frame).toContain("C-1");expect(frame).toContain("SYNC CONFLICT")}finally{setup.renderer.destroy()}
  })
  test("supports bounded navigation and entity deep links",()=>{expect(moveNotebookSelection(0,1,1)).toBe(0);expect(notebookDeepLink(block)).toBe("claim:C-1")})
})
