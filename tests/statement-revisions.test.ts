import { afterEach, describe, expect, test } from "bun:test"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { DatabaseClient, StatementRevisionRepository } from "@mathos/storage"
import { StatementRevisionService } from "@mathos/core"

const clients:DatabaseClient[]=[]
function setup(){const client=new DatabaseClient(join(tmpdir(),`mathos-revisions-${crypto.randomUUID()}.sqlite`));client.migrate();clients.push(client);let id=0;const events:string[]=[];return{repo:new StatementRevisionRepository(client.db),events,service:new StatementRevisionService({revisions:new StatementRevisionRepository(client.db),clock:{now:()=>"2030-01-01T00:00:00.000Z"},nextId:()=>`SR-${++id}`,writeEvent:(type)=>events.push(type)})}}
afterEach(()=>{while(clients.length)clients.pop()!.close()})

describe("statement revisions",()=>{
  test("binds natural/formal hashes to context and suppresses no-op edits",()=>{const{service,repo,events}=setup();const first=service.capture({claimId:"C-1",kind:"NATURAL",sourceEntityId:"C-1",text:"A",contextRevisionId:"CR-1",createdBy:"user"});const same=service.capture({claimId:"C-1",kind:"NATURAL",sourceEntityId:"C-1",text:"A",contextRevisionId:"CR-1",createdBy:"user"});const changed=service.capture({claimId:"C-1",kind:"NATURAL",sourceEntityId:"C-1",text:"B",contextRevisionId:"CR-1",createdBy:"user"});const formal=service.capture({claimId:"C-1",kind:"FORMAL",sourceEntityId:"FS-1",text:"theorem t : True",contextRevisionId:"CR-1",createdBy:"model"});expect(same.id).toBe(first.id);expect(changed.revision).toBe(2);expect(formal.contentHash).not.toBe(first.contentHash);expect(repo.list("C-1")).toHaveLength(3);expect(events).toHaveLength(3)})
  test("additively backfills legacy current statements without model calls",()=>{const{service,repo}=setup();const count=service.backfillLegacy([{id:"C-1",naturalStatement:"Natural"}],[{id:"FS-1",claimId:"C-1",sourceText:"formal"}],"CR-legacy");expect(count).toBe(2);expect(service.backfillLegacy([{id:"C-1",naturalStatement:"Natural"}],[{id:"FS-1",claimId:"C-1",sourceText:"formal"}],"CR-legacy")).toBe(0);expect(repo.list("C-1")).toHaveLength(2)})
})
