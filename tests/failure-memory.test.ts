import { afterEach, describe, expect, test } from "bun:test"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { DatabaseClient, FailureFingerprintRepository, FailureOccurrenceRepository } from "@mathos/storage"
import { FailureMemoryService } from "../packages/core/src/services/failure-memory-service.ts"

const clients:DatabaseClient[]=[]
function setup(){const client=new DatabaseClient(join(tmpdir(),`mathos-failure-${crypto.randomUUID()}.sqlite`));client.migrate();clients.push(client);let id=0;const service=new FailureMemoryService({failures:new FailureFingerprintRepository(client.db),occurrences:new FailureOccurrenceRepository(client.db),unitOfWork:(work)=>client.unitOfWork(work),now:()=>`2030-01-0${id+1}`,nextId:(p)=>`${p}-${++id}`});return{service,client}}
afterEach(()=>{while(clients.length)clients.pop()!.close()})
const draft={domain:"PROOF" as const,failureClass:"UNKNOWN_IDENTIFIER",diagnostic:"C:\\repo\\.mathos\\tmp\\Main.lean:12:7: error: unknown identifier 'foo' at 2030-01-01T10:20:30Z",attemptedApproach:"simp [foo]",goalHash:"g1",contextHash:"c1",premiseSetHash:"p1"}

describe("failure memory",()=>{
  test("deduplicates the same semantic failure and increments occurrences",()=>{const{service}=setup();const a=service.record(draft,{runId:"R-1"}),b=service.record({...draft,diagnostic:"D:\\other\\tmp\\Main.lean:99:2: error: unknown identifier 'foo' at 2031-02-03T00:00:00Z"},{runId:"R-2"});expect(b.failure.id).toBe(a.failure.id);expect(b.failure.occurrenceCount).toBe(2);expect(service.occurrences(a.failure.id)).toHaveLength(2);expect(a.failure.normalizedDiagnostic).toContain("unknown identifier 'foo'");expect(a.failure.normalizedDiagnostic).not.toContain("C:\\repo")})
  test("keeps different context fingerprints distinct",()=>{const{service}=setup();const a=service.record(draft),b=service.record({...draft,contextHash:"c2"});expect(a.failure.id).not.toBe(b.failure.id)})
  test("reports exactly what changed since an earlier attempt",()=>{const{service}=setup();expect(service.changedSince(draft,{...draft,attemptedApproach:"aesop",premiseSetHash:"p2",contextHash:"c2"})).toEqual(["contextHash","attemptedApproach","premiseSetHash"])})
  test("never persists secret values or absolute environment paths",()=>{const{service}=setup();const result=service.record(draft,{artifactRefs:["C:\\repo\\proofs\\bad.lean"],workspaceRoot:"C:\\repo",environment:{platform:"win32",apiKey:"top-secret",token:"also-secret",toolPath:"C:\\Lean\\bin\\lake.exe"}});const occurrence=service.occurrences(result.failure.id)[0]!;const persisted=JSON.stringify(occurrence);expect(persisted).not.toContain("top-secret");expect(persisted).not.toContain("also-secret");expect(persisted).not.toContain("C:\\\\repo");expect(occurrence.artifactRefs).toEqual(["proofs/bad.lean"]);expect(String(occurrence.environmentFingerprint)).toMatch(/^sha256:/)})
})
