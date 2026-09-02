import { createHash } from "node:crypto"
import { relative } from "node:path"
import type { FailureFingerprint,FailureOccurrenceDraft } from "@mathos/domain"
import type { FailureFingerprintRepository,FailureOccurrenceRepository } from "@mathos/storage"

type Row={id:string;[key:string]:unknown}
export interface FailureMemoryDependencies{failures:FailureFingerprintRepository;occurrences:FailureOccurrenceRepository;unitOfWork<T>(work:()=>T):T;now():string;nextId(prefix:string):string}
export interface FailureOccurrenceContext{runId?:string|null;jobId?:string|null;stepId?:string|null;candidateId?:string|null;artifactRefs?:string[];workspaceRoot?:string;environment?:Record<string,unknown>}
const digest=(value:string)=>createHash("sha256").update(value).digest("hex")
export function normalizeFailureDiagnostic(value:string):string{return value.normalize("NFC").replace(/(?:[A-Za-z]:\\[^:\r\n]+|\/[^:\r\n]+):\d+:\d+/g,"<workspace-path>:<line>:<col>").replace(/\b\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z\b/g,"<timestamp>").replace(/\bline\s+\d+(?:,?\s+column\s+\d+)?/gi,"line <n>").replace(/[ \t]+/g," ").trim()}
export class FailureMemoryService{
  constructor(private readonly d:FailureMemoryDependencies){}
  record(draft:FailureOccurrenceDraft,context:FailureOccurrenceContext={}):{failure:FailureFingerprint;occurrence:Row;duplicate:boolean}{
    const normalizedDiagnostic=normalizeFailureDiagnostic(draft.diagnostic),fingerprint=digest(JSON.stringify([draft.domain,draft.goalHash??null,draft.contextHash??null,draft.failureClass,normalizedDiagnostic,draft.attemptedApproach.trim(),draft.premiseSetHash??null])),now=this.d.now()
    let failure=this.d.failures.findByFingerprint(fingerprint),duplicate=Boolean(failure)
    const occurrenceId=this.d.nextId("FO")
    const artifactRefs=(context.artifactRefs??[]).map(path=>context.workspaceRoot?relative(context.workspaceRoot,path).replace(/\\/g,"/"):path.replace(/\\/g,"/"))
    const environmentFingerprint=`sha256:${digest(JSON.stringify(this.safeEnvironment(context.environment??{})))}`
    let occurrence:Row={id:occurrenceId,failureId:"",runId:context.runId??null,jobId:context.jobId??null,stepId:context.stepId??null,candidateId:context.candidateId??null,artifactRefs,environmentFingerprint,createdAt:now}
    this.d.unitOfWork(()=>{if(failure)failure=this.d.failures.increment(failure.id,now);else{failure={id:this.d.nextId("FF"),domain:draft.domain,goalHash:draft.goalHash??null,contextHash:draft.contextHash??null,failureClass:draft.failureClass,normalizedDiagnostic,attemptedApproach:draft.attemptedApproach.trim(),premiseSetHash:draft.premiseSetHash??null,fingerprint,occurrenceCount:1,firstSeenAt:now,lastSeenAt:now};this.d.failures.insert(failure as unknown as Row)}occurrence={...occurrence,failureId:failure!.id};this.d.occurrences.insert(occurrence)})
    return{failure:failure as unknown as FailureFingerprint,occurrence,duplicate}
  }
  occurrences(failureId:string):Row[]{return this.d.occurrences.listForFailure(failureId)}
  changedSince(before:FailureOccurrenceDraft,after:FailureOccurrenceDraft):string[]{const fields:Array<keyof FailureOccurrenceDraft>=["domain","goalHash","contextHash","failureClass","diagnostic","attemptedApproach","premiseSetHash"];return fields.filter(key=>(key==="diagnostic"?normalizeFailureDiagnostic(String(before[key]??"")):before[key]??null)!==(key==="diagnostic"?normalizeFailureDiagnostic(String(after[key]??"")):after[key]??null))}
  private safeEnvironment(value:Record<string,unknown>):Record<string,unknown>{return Object.fromEntries(Object.entries(value).filter(([key])=>!/key|token|secret|password|authorization/i.test(key)).map(([key,item])=>[key,typeof item==="string"&&/^(?:[A-Za-z]:\\|\/)/.test(item)?`path:${item.replace(/.*[\\/]/,"")}`:item]))}
}
