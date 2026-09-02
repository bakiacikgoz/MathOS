import { parseProofCandidateDraft,type ProofCandidateDraft,type ProverAdapterDescriptor } from "@mathos/domain"
export interface ProverRequest{language:string;formalSource:string;strategy:string;diagnostics?:string[];premises?:string[]}
export interface ProverAdapter{descriptor:ProverAdapterDescriptor;languages:readonly string[];generate(request:ProverRequest):Promise<unknown>}
export interface ProverEnvironment{language:string;online:boolean}
export type ProverCapability=keyof ProverAdapterDescriptor["capabilities"]
export class ProverRegistry{
  private readonly adapters=new Map<string,ProverAdapter>()
  constructor(adapters:ProverAdapter[]=[]){for(const adapter of adapters)this.register(adapter)}
  register(adapter:ProverAdapter):void{const key=`${adapter.descriptor.id}@${adapter.descriptor.version}`;if(this.adapters.has(key))throw new Error(`DUPLICATE_PROVER_ADAPTER: ${key}`);this.adapters.set(key,adapter)}
  list():ProverAdapter[]{return[...this.adapters.values()].sort((a,b)=>a.descriptor.id.localeCompare(b.descriptor.id)||a.descriptor.version.localeCompare(b.descriptor.version))}
  select(input:ProverEnvironment&{capability:ProverCapability}):ProverAdapter[]{return this.list().filter((adapter)=>adapter.descriptor.health==="READY"&&adapter.languages.includes(input.language)&&adapter.descriptor.capabilities[input.capability]&&(!adapter.descriptor.capabilities.requiresNetwork||input.online))}
  require(id:string,version:string,environment:ProverEnvironment):ProverAdapter{const adapter=this.adapters.get(`${id}@${version}`);if(!adapter)throw new Error(`PROVER_ADAPTER_NOT_FOUND: ${id}@${version}`);if(!adapter.languages.includes(environment.language))throw new Error(`UNSUPPORTED_FORMAL_LANGUAGE: ${environment.language}`);if(adapter.descriptor.capabilities.requiresNetwork&&!environment.online)throw new Error("PROVER_REQUIRES_NETWORK");if(adapter.descriptor.health!=="READY")throw new Error(`PROVER_UNAVAILABLE: ${adapter.descriptor.health}`);return adapter}
  async generate(id:string,version:string,request:ProverRequest,environment:{online:boolean}):Promise<ProofCandidateDraft>{const raw=await this.require(id,version,{language:request.language,online:environment.online}).generate(request);if(!raw||typeof raw!=="object")throw new Error("INVALID_PROVER_OUTPUT");return parseProofCandidateDraft(raw as Record<string,unknown>)}
}
