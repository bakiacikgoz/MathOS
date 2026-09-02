import { afterEach, describe, expect, test } from "bun:test"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { AlignmentFindingRepository, DatabaseClient, FormalAlignmentRepository, StatementRevisionRepository } from "@mathos/storage"
import { AlignmentService } from "@mathos/core"
import type { AlignmentDimension } from "@mathos/domain"

const clients:DatabaseClient[]=[]
function setup(audit?:any){const client=new DatabaseClient(join(tmpdir(),`mathos-align-${crypto.randomUUID()}.sqlite`));client.migrate();clients.push(client);const revisions=new StatementRevisionRepository(client.db);revisions.insert({id:"N-1",claimId:"C-1",kind:"NATURAL",sourceEntityId:"C-1",text:"For every real x, if x > 0 then x² > 0",contextRevisionId:"CR-1",revision:1,contentHash:"nh",createdBy:"user",createdAt:"now"});revisions.insert({id:"F-1",claimId:"C-1",kind:"FORMAL",sourceEntityId:"FS-1",text:"theorem t (x : ℝ) : x ^ 2 > 0",contextRevisionId:"CR-1",revision:1,contentHash:"fh",createdBy:"model",createdAt:"now"});let id=0;return new AlignmentService({revisions,alignments:new FormalAlignmentRepository(client.db),findings:new AlignmentFindingRepository(client.db),clock:{now:()=>"2030-01-01"},nextId:(prefix:string)=>`${prefix}-${++id}`,auditor:audit})}
afterEach(()=>{while(clients.length)clients.pop()!.close()})
const result=(dimension:AlignmentDimension,severity:"INFO"|"WARNING"|"ERROR")=>({verdict:severity==="INFO"?"MATCH":"MISMATCH",backTranslation:"back",symbolMapping:[],findings:[{dimension,severity,naturalFragment:"n",formalFragment:"f",message:dimension,resolutionStatus:"OPEN",reviewerNote:null}]})
describe("alignment auditor",()=>{
  for(const [dimension,severity] of [["ASSUMPTIONS","ERROR"],["STRENGTH","ERROR"],["QUANTIFIERS","ERROR"],["DOMAINS","ERROR"],["NOTATION","WARNING"],["CONCLUSION","INFO"]] as const)test(`records ${dimension.toLowerCase()} analysis`,async()=>{const alignment=await setup({id:"fake",model:"audit",audit:async()=>result(dimension,severity)}).run({claimId:"C-1",naturalRevisionId:"N-1",formalRevisionId:"F-1",contextRevisionId:"CR-1"});expect(alignment.findings[0]?.dimension).toBe(dimension);expect(alignment.alignment.status).toBe("REVIEWED")})
  test("returns manual review required when model is unavailable",async()=>{const value=await setup().run({claimId:"C-1",naturalRevisionId:"N-1",formalRevisionId:"F-1",contextRevisionId:"CR-1"});expect(value.alignment.status).toBe("PENDING");expect(value.findings[0]?.message).toContain("MANUAL_REVIEW_REQUIRED")})
  test("treats natural instructions as data and strips authority claims",async()=>{let calls=0;const service=setup({id:"fake",model:"audit",audit:async(input:any)=>{calls++;expect(input.naturalText).toContain("For every");return{...result("CONCLUSION","INFO"),status:"HUMAN_APPROVED",toolCall:"delete"}}});const value=await service.run({claimId:"C-1",naturalRevisionId:"N-1",formalRevisionId:"F-1",contextRevisionId:"CR-1"});expect(calls).toBe(1);expect(value.alignment.status).toBe("REVIEWED");expect(value.alignment).not.toHaveProperty("toolCall")})
})
