import { InvalidStructuredResponse, ModelAuthenticationFailed, ModelResponseTooLarge, ModelTimeout, ModelUnavailable } from "../errors.ts"
import type { ModelRequest } from "../types.ts"
import type { HttpTransportConfig, NormalizedTransport, NormalizedTransportResponse } from "./types.ts"
import { readJsonBody } from "./structured-output.ts"

export class OpenAIResponsesTransport implements NormalizedTransport {
  readonly protocol = "openai-responses" as const
  constructor(private readonly config: HttpTransportConfig) {}
  async generate(request: ModelRequest): Promise<NormalizedTransportResponse> {
    const timeout=AbortSignal.timeout(this.config.timeoutMs??60_000),signal=request.signal?AbortSignal.any([request.signal,timeout]):timeout
    const body:Record<string,unknown>={model:this.config.model,input:request.messages.map(message=>({role:message.role,content:message.content}))}
    if(request.maxOutputTokens!==undefined)body.max_output_tokens=request.maxOutputTokens
    if(request.reasoningEffort&&request.reasoningEffort!=="none")body.reasoning={effort:request.reasoningEffort}
    if(request.responseSchema)body.text={format:{type:"json_schema",name:request.responseSchema.name,strict:true,schema:request.responseSchema.jsonSchema}}
    try{const response=await(this.config.fetch??fetch)(`${this.config.baseUrl.replace(/\/$/,"")}/responses`,{method:"POST",headers:{"content-type":"application/json",authorization:`Bearer ${this.config.apiKey}`},body:JSON.stringify(body),signal});if(response.status===401||response.status===403)throw new ModelAuthenticationFailed();if(!response.ok)throw Object.assign(new Error(`Model endpoint returned ${response.status}.`),{status:response.status});const payload=await readJsonBody(response,this.config.maxResponseBytes);const text=typeof payload.output_text==="string"?payload.output_text:payload.output?.flatMap((item:any)=>item.content??[]).find((item:any)=>item.type==="output_text")?.text;if(typeof text!=="string"||!text)throw new InvalidStructuredResponse("Model response had no output text.");return{text,usage:{inputTokens:finite(payload.usage?.input_tokens),outputTokens:finite(payload.usage?.output_tokens)},rawResponseId:typeof payload.id==="string"?payload.id:undefined}}catch(error){if(error instanceof ModelAuthenticationFailed||error instanceof InvalidStructuredResponse||error instanceof ModelResponseTooLarge)throw error;if(signal.aborted&&!request.signal?.aborted)throw new ModelTimeout();throw error instanceof Error&&"status" in error?error:new ModelUnavailable(error instanceof Error?error.message:String(error))}
  }
}
const finite=(value:unknown)=>typeof value==="number"&&Number.isFinite(value)?value:undefined
