import { describe,expect,test } from "bun:test"
import { testRender } from "@opentui/solid"
import { PortfolioView,portfolioSnapshot } from "../apps/tui/src/ui/PortfolioViews.tsx"
import { FailureMemoryView,failureMemorySnapshot } from "../apps/tui/src/ui/FailureMemoryViews.tsx"

describe("proof portfolio TUI",()=>{
  test("shows candidates, budget, diagnostics and explicit trust labels",async()=>{const snapshot=portfolioSnapshot({portfolio:{id:"PF-1",winnerCandidateId:"PC-2"},jobs:[{id:"J-1",budget:{attempts:3}}],runningJobs:1,candidates:[{id:"PC-1",status:"REJECTED",compileResult:"FAILED",axioms:[],forbidden:["sorry"]},{id:"PC-2",status:"VERIFIED",compileResult:"KERNEL_ACCEPTED",axioms:[],forbidden:[]}]});const setup=await testRender(()=><PortfolioView snapshot={snapshot}/>,{width:110,height:20});try{await setup.renderOnce();const frame=setup.captureCharFrame();expect(frame).toContain("PROOF COCKPIT");expect(frame).toContain("VerificationGate");expect(frame).toContain("PC-1");expect(frame).toContain("sorry");expect(frame).toContain("PC-2");expect(frame).toContain("BUDGET 3")}finally{setup.renderer.destroy()}})
  test("shows similar failure count and changed-since fields",async()=>{const snapshot=failureMemorySnapshot({id:"FF-1",failureClass:"UNKNOWN_IDENTIFIER",normalizedDiagnostic:"unknown identifier foo"},[{id:"FO-1",environmentFingerprint:"sha256:x"}], ["premiseSetHash"]);const setup=await testRender(()=><FailureMemoryView snapshot={snapshot}/>,{width:90,height:15});try{await setup.renderOnce();const frame=setup.captureCharFrame();expect(frame).toContain("FAILURE MEMORY");expect(frame).toContain("OCCURRENCES 1");expect(frame).toContain("premiseSetHash");expect(frame).not.toContain("raw prompt")}finally{setup.renderer.destroy()}})
})
