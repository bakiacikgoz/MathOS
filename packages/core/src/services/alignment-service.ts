import { createHash } from "node:crypto"
import { ALIGNMENT_DIMENSIONS, type AlignmentDimension, type AlignmentFinding, type FormalAlignment } from "@mathos/domain"
import type { AlignmentFindingRepository, FormalAlignmentRepository, StatementRevisionRepository } from "@mathos/storage"
import type { ClockPort } from "../ports/clock-port.ts"
import { ALIGNMENT_SYSTEM_PROMPT } from "../alignment-prompt.ts"

export interface AlignmentAuditOutput{verdict:"MATCH"|"POTENTIAL_MISMATCH"|"MISMATCH";backTranslation:string;symbolMapping:Array<{natural:string;formal:string;status:string}>;findings:Array<Omit<AlignmentFinding,"id"|"alignmentId">>}
export interface AlignmentAuditor{id:string;model:string;audit(input:{system:string;naturalText:string;formalText:string;contextRevisionId:string;repair?:string}):Promise<unknown>}
export interface AlignmentDependencies{revisions:StatementRevisionRepository;alignments:FormalAlignmentRepository;findings:AlignmentFindingRepository;clock:ClockPort;nextId(prefix:string):string;auditor?:AlignmentAuditor}
const hash=(text:string)=>createHash("sha256").update(text).digest("hex")
function parse(value:any):AlignmentAuditOutput{if(!value||!["MATCH","POTENTIAL_MISMATCH","MISMATCH"].includes(value.verdict)||!Array.isArray(value.findings))throw new Error("INVALID_ALIGNMENT_OUTPUT");for(const finding of value.findings)if(!(ALIGNMENT_DIMENSIONS as readonly string[]).includes(finding.dimension)||!["INFO","WARNING","ERROR"].includes(finding.severity))throw new Error("INVALID_ALIGNMENT_FINDING");return{verdict:value.verdict,backTranslation:String(value.backTranslation??""),symbolMapping:Array.isArray(value.symbolMapping)?value.symbolMapping.map((item:any)=>({natural:String(item.natural??""),formal:String(item.formal??""),status:String(item.status??"")})):[],findings:value.findings.map((item:any)=>({dimension:item.dimension as AlignmentDimension,severity:item.severity,naturalFragment:String(item.naturalFragment??""),formalFragment:String(item.formalFragment??""),message:String(item.message??""),resolutionStatus:String(item.resolutionStatus??"OPEN"),reviewerNote:item.reviewerNote==null?null:String(item.reviewerNote)}))}}
export class AlignmentService{
  constructor(private readonly d:AlignmentDependencies){}
  async run(input:{claimId:string;naturalRevisionId:string;formalRevisionId:string;contextRevisionId:string}):Promise<{alignment:FormalAlignment;findings:AlignmentFinding[]}>{
    const natural=this.d.revisions.get(input.naturalRevisionId),formal=this.d.revisions.get(input.formalRevisionId);if(!natural||!formal||natural.claimId!==input.claimId||formal.claimId!==input.claimId)throw new Error("ALIGNMENT_REVISION_NOT_FOUND");if(natural.contextRevisionId!==input.contextRevisionId||formal.contextRevisionId!==input.contextRevisionId)throw new Error("ALIGNMENT_CONTEXT_MISMATCH")
    let output:AlignmentAuditOutput|undefined
    if(this.d.auditor){for(let attempt=0;attempt<2&&!output;attempt++)try{output=parse(await this.d.auditor.audit({system:ALIGNMENT_SYSTEM_PROMPT,naturalText:natural.text,formalText:formal.text,contextRevisionId:input.contextRevisionId,...(attempt?{repair:"Return valid schema only"}:{})}))}catch{if(attempt===1)output=undefined}}
    const now=this.d.clock.now(),id=this.d.nextId("AL")
    const alignment:FormalAlignment={id,claimId:input.claimId,naturalRevisionId:natural.id,formalRevisionId:formal.id,contextRevisionId:input.contextRevisionId,status:output?"REVIEWED":"PENDING",verdict:output?.verdict??"POTENTIAL_MISMATCH",backTranslation:output?.backTranslation??"",symbolMapping:output?.symbolMapping??[],auditorProvider:this.d.auditor?.id??null,auditorModel:this.d.auditor?.model??null,promptHash:hash(ALIGNMENT_SYSTEM_PROMPT),createdAt:now,decidedAt:output?now:null}
    this.d.alignments.insert(alignment)
    const raw=output?.findings??[{dimension:"SCOPE" as const,severity:"WARNING" as const,naturalFragment:"",formalFragment:"",message:"MANUAL_REVIEW_REQUIRED: alignment model unavailable or invalid",resolutionStatus:"OPEN",reviewerNote:null}]
    const findings=raw.map((finding)=>({...finding,id:this.d.nextId("AF"),alignmentId:id}));for(const finding of findings)this.d.findings.insert(finding)
    return{alignment,findings}
  }
}
