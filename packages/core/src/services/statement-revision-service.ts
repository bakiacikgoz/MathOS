import { createHash } from "node:crypto"
import type { StatementRevision } from "@mathos/domain"
import type { StatementRevisionRepository } from "@mathos/storage"
import type { ClockPort } from "../ports/clock-port.ts"

export interface CaptureStatementRevision { claimId:string;kind:"NATURAL"|"FORMAL";sourceEntityId:string;text:string;contextRevisionId:string;createdBy:string }
export interface StatementRevisionDependencies { revisions:StatementRevisionRepository;clock:ClockPort;nextId():string;writeEvent(type:string,payload:Record<string,unknown>):void }
const hash=(value:string)=>createHash("sha256").update(value.normalize("NFC")).digest("hex")
export class StatementRevisionService{
  constructor(private readonly d:StatementRevisionDependencies){}
  capture(input:CaptureStatementRevision):StatementRevision{
    const contentHash=hash(JSON.stringify({text:input.text.normalize("NFC"),contextRevisionId:input.contextRevisionId})),latest=this.d.revisions.latest(input.claimId,input.kind)
    if(latest?.contentHash===contentHash&&latest.sourceEntityId===input.sourceEntityId)return latest
    const revision:StatementRevision={...input,id:this.d.nextId(),revision:(latest?.revision??0)+1,contentHash,createdAt:this.d.clock.now()}
    this.d.revisions.insert(revision);this.d.writeEvent("statement.revision.created",{revisionId:revision.id,claimId:revision.claimId,kind:revision.kind,contentHash,contextRevisionId:revision.contextRevisionId});return revision
  }
  backfillLegacy(claims:Array<{id:string;naturalStatement:string}>,formals:Array<{id:string;claimId:string;sourceText:string}>,contextRevisionId:string):number{
    let created=0
    for(const claim of claims){if(this.d.revisions.latest(claim.id,"NATURAL"))continue;this.capture({claimId:claim.id,kind:"NATURAL",sourceEntityId:claim.id,text:claim.naturalStatement,contextRevisionId,createdBy:"legacy-backfill"});created++}
    for(const formal of formals){if(this.d.revisions.latest(formal.claimId,"FORMAL"))continue;this.capture({claimId:formal.claimId,kind:"FORMAL",sourceEntityId:formal.id,text:formal.sourceText,contextRevisionId,createdBy:"legacy-backfill"});created++}
    return created
  }
}
