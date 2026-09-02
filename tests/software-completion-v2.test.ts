import { expect, test } from "bun:test"
import baseline from "../benchmarks/software-completion-v2-baseline.json"
import { evaluateSoftwareCompletion } from "../scripts/run-software-completion-v2.ts"
const pass=(revision="a".repeat(40))=>baseline.requiredGateIds.map(id=>({id,status:"PASS" as const,evidence:{command:["test"],exitCode:0,outputHash:"b".repeat(64)},sourceRevision:revision,artifactHashes:{report:"c".repeat(64)}}))
test("qualification requires exact 22 real PASS gates and current evidence",()=>{expect(evaluateSoftwareCompletion(pass(),"a".repeat(40)).ready).toBe(true);for(const rows of [pass().slice(1),pass().map((x,i)=>i?x:{...x,status:"SKIPPED_UNSUPPORTED_PLATFORM" as const}),pass().map((x,i)=>i?x:{...x,evidence:{...x.evidence,command:["fake evidence"]}}),pass("d".repeat(40))])expect(evaluateSoftwareCompletion(rows as any,"a".repeat(40)).ready).toBe(false)})
test("artifact mismatches and any blocker prevent readiness",()=>{const rows=pass();rows[0]!.artifactHashes.report="bad";expect(evaluateSoftwareCompletion(rows,"a".repeat(40)).ready).toBe(false);expect(evaluateSoftwareCompletion(pass(),"a".repeat(40),["open blocker"]).ready).toBe(false)})
