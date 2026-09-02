import { afterEach, describe, expect, test } from "bun:test"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { downstreamImpact, type ImpactGraph } from "@mathos/graph"
import { DatabaseClient, StaleMarkerRepository } from "@mathos/storage"
import { ImpactStalenessService } from "@mathos/core"

const graph:ImpactGraph={nodes:["CTX-1","C-1","F-1","P-1","V-1","PUB-1","SRC-1","CIT-1"].map((id)=>({id,entityType:id.split("-")[0]!,entityId:id,revision:1,contentHash:id,status:id==="V-1"?"KERNEL_ACCEPTED":null})),edges:[{from:"CTX-1",to:"C-1",reasonCode:"CONTEXT_CHANGED"},{from:"C-1",to:"F-1",reasonCode:"CLAIM_CHANGED"},{from:"F-1",to:"P-1",reasonCode:"FORMAL_CHANGED"},{from:"P-1",to:"V-1",reasonCode:"PROOF_CHANGED"},{from:"V-1",to:"PUB-1",reasonCode:"VERIFICATION_STALE"},{from:"PUB-1",to:"C-1",reasonCode:"cycle"},{from:"SRC-1",to:"CIT-1",reasonCode:"SOURCE_CHANGED"},{from:"CIT-1",to:"C-1",reasonCode:"CITATION_CHANGED"}]}
const clients:DatabaseClient[]=[]
function setup(){const client=new DatabaseClient(join(tmpdir(),`mathos-impact-${crypto.randomUUID()}.sqlite`));client.migrate();clients.push(client);let id=0;return{repo:new StaleMarkerRepository(client.db),service:new ImpactStalenessService({markers:new StaleMarkerRepository(client.db),clock:{now:()=>"2030"},nextId:()=>`SM-${++id}`})}}
afterEach(()=>{while(clients.length)clients.pop()!.close()})
describe("impact and staleness",()=>{
  test("deterministically traverses context and source paths and terminates cycles",()=>{expect(downstreamImpact(graph,"CTX-1").map((item)=>item.node.id)).toEqual(["C-1","F-1","P-1","PUB-1","V-1"]);expect(downstreamImpact(graph,"SRC-1").map((item)=>item.node.id)).toEqual(["C-1","CIT-1","F-1","P-1","PUB-1","V-1"])})
  test("creates idempotent markers without mutating historical verification",()=>{const{service,repo}=setup();const change={before:{entityType:"CONTEXT",entityId:"CTX-1",revision:1,contentHash:"old"},after:{entityType:"CONTEXT",entityId:"CTX-1",revision:2,contentHash:"new"}};const first=service.apply(change,graph),second=service.apply(change,graph);expect(second.map((item)=>item.id)).toEqual(first.map((item)=>item.id));expect(repo.unresolved()).toHaveLength(5);expect(graph.nodes.find((node)=>node.id==="V-1")?.status).toBe("KERNEL_ACCEPTED")})
  test("resolves only with matching source revision evidence",()=>{const{service}=setup();const change={before:null,after:{entityType:"SOURCE",entityId:"SRC-1",revision:2,contentHash:"new-source"}};const marker=service.apply(change,graph)[0]!;expect(()=>service.revalidate(marker.id,{sourceId:"SRC-1",contentHash:"wrong"})).toThrow("REVALIDATION_EVIDENCE_MISMATCH");expect(service.revalidate(marker.id,{sourceId:"SRC-1",contentHash:"new-source"}).resolvedAt).toBe("2030")})
})
