import { InvalidStructuredResponse, ModelNotConfigured, ModelTimeout, ModelUnavailable } from "./errors.ts"
import { extractJson } from "./json.ts"
import type { ModelConfig, ModelProvider, ModelRequest, ModelResponse, StructuredModelRequest } from "./types.ts"
import { retryModelCall } from "./retry.ts"
import type { ModelUsageLedger } from "./usage.ts"
import { OpenAIChatTransport } from "./transports/openai-chat.ts"

export class OpenAICompatibleProvider implements ModelProvider {
  readonly id:string;readonly model:string
  readonly capabilities={structuredOutput:true,toolCalling:false,reasoning:true,streaming:false,vision:false}
  private readonly transport:OpenAIChatTransport
  constructor(private readonly config:ModelConfig,fetchImpl:typeof fetch=fetch,private readonly usage?:Pick<ModelUsageLedger,"record">){this.id=config.provider;this.model=config.model;this.transport=new OpenAIChatTransport({...config,fetch:fetchImpl})}
  async generate(request:ModelRequest):Promise<ModelResponse>{
    if(!this.config.apiKey||!this.config.model)throw new ModelNotConfigured("Set MATHOS_API_KEY and MATHOS_MODEL to enable research intake.")
    const started=Date.now();let retries=0
    try{const outcome=await retryModelCall(()=>this.transport.generate(request),{signal:request.signal});retries=outcome.retries;const response=outcome.value;this.usage?.record({profileId:this.id,model:this.model,role:request.metadata?.role??request.role??"primary",durationMs:Date.now()-started,retries,success:true,inputTokens:response.usage.inputTokens,outputTokens:response.usage.outputTokens,researchRunId:request.metadata?.researchRunId??request.researchRunId});return{text:response.text,provider:this.id,model:this.model}}
    catch(error){this.usage?.record({profileId:this.id,model:this.model,role:request.metadata?.role??request.role??"primary",durationMs:Date.now()-started,retries,success:false,errorClass:error instanceof Error?error.name:"UNKNOWN",researchRunId:request.metadata?.researchRunId??request.researchRunId});if(request.signal?.aborted)throw error;if(error instanceof ModelTimeout)throw error;if(error instanceof Error&&["ModelAuthenticationFailed","ModelResponseTooLarge","InvalidStructuredResponse"].includes(error.name))throw error;throw new ModelUnavailable(error instanceof Error?error.message:String(error))}
  }
  async generateStructured<T>(request:StructuredModelRequest<T>):Promise<T>{
    const structured={...request,responseSchema:request.responseSchema??{name:request.schemaName,jsonSchema:{type:"object",additionalProperties:true}}}
    const first=await this.generate(structured)
    try{return request.parse(extractJson(first.text))}catch(error){const reason=error instanceof Error?error.message:"invalid structured response";const retry=await this.generate({...structured,messages:[...request.messages,{role:"assistant",content:first.text},{role:"user",content:`Your previous JSON failed validation: ${reason}. Return only valid JSON for ${request.schemaName}.`}]});try{return request.parse(extractJson(retry.text))}catch{throw new InvalidStructuredResponse("The model returned an invalid structured response after one repair attempt.")}}
  }
}
