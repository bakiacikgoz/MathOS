import { posix,win32 } from "node:path"
import type { SolverTrustClass } from "@mathos/domain"
export interface SolverAdapterDescriptor{id:string;version:string;kind:"NATIVE"|"EXTERNAL";executable:string|null;problemKinds:string[];maxTrustClass:SolverTrustClass;requiresSandbox:boolean;requiresNetwork:boolean;health?:"READY"|"UNAVAILABLE"}
export interface SolverRegistryOptions{root:string;isExecutableAvailable(path:string):boolean}
const pathApi=(root:string)=>win32.isAbsolute(root)?win32:posix
export class SolverRegistry{
  private readonly adapters=new Map<string,SolverAdapterDescriptor>()
  constructor(private readonly options:SolverRegistryOptions){}
  register(input:SolverAdapterDescriptor):SolverAdapterDescriptor{const key=`${input.id}@${input.version}`;if(this.adapters.has(key))throw new Error(`SOLVER_ADAPTER_DUPLICATE:${key}`);if(input.kind==="EXTERNAL"&&!input.requiresSandbox)throw new Error("EXTERNAL_SOLVER_SANDBOX_REQUIRED");const paths=pathApi(this.options.root),executable=input.executable?(paths.isAbsolute(input.executable)?paths.resolve(input.executable):paths.resolve(this.options.root,input.executable)):null;const descriptor=Object.freeze({...input,executable,problemKinds:Object.freeze([...input.problemKinds]) as unknown as string[],health:executable&&!this.options.isExecutableAvailable(executable)?"UNAVAILABLE" as const:"READY" as const});this.adapters.set(key,descriptor);return descriptor}
  list():SolverAdapterDescriptor[]{return [...this.adapters.values()].sort((a,b)=>`${a.id}@${a.version}`.localeCompare(`${b.id}@${b.version}`))}
  availableFor(problemKind:string):SolverAdapterDescriptor[]{return this.list().filter(item=>item.health==="READY"&&item.problemKinds.includes(problemKind))}
}
