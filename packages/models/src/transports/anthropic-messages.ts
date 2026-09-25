import { InvalidStructuredResponse, ModelAuthenticationFailed, ModelResponseTooLarge, ModelTimeout, ModelUnavailable, ProviderQuotaExhausted, ProviderRateLimited } from "../errors.ts"
import type { ModelRequest } from "../types.ts"
import type { HttpTransportConfig, NormalizedTransport, NormalizedTransportResponse } from "./types.ts"
import { jsonOnlyMessages, readJsonBody } from "./structured-output.ts"
import { parseJsonEvent, readSse, streamDeadline } from "./sse.ts"

export class AnthropicMessagesTransport implements NormalizedTransport {
  readonly protocol="anthropic-messages" as const
  constructor(private readonly config:HttpTransportConfig){}
  async generate(request:ModelRequest):Promise<NormalizedTransportResponse>{
    const streaming=Boolean(request.onDelta)&&!request.responseSchema,deadline=streaming?streamDeadline(this.config.timeoutMs??60_000,request.signal):null
    const timeout=AbortSignal.timeout(this.config.timeoutMs??60_000),signal=deadline?.signal??(request.signal?AbortSignal.any([request.signal,timeout]):timeout)
    const source=jsonOnlyMessages(request.messages,request.responseSchema),system=source.filter(message=>message.role==="system").map(message=>message.content).join("\n"),messages=source.filter(message=>message.role!=="system")
    const body:Record<string,unknown>={model:this.config.model,max_tokens:request.maxOutputTokens??4096,messages,...(system?{system}:{})}
    if(request.temperature!==undefined)body.temperature=request.temperature
    if(request.reasoningEffort&&this.config.supportedReasoningEfforts&&!this.config.supportedReasoningEfforts.includes(request.reasoningEffort))throw new Error(`REASONING_EFFORT_UNSUPPORTED: ${request.reasoningEffort}`)
    if(request.reasoningEffort&&request.reasoningEffort!=="none"){body.thinking={type:"adaptive"};body.output_config={effort:request.reasoningEffort}}
    if(streaming)body.stream=true
    try{const response=await(this.config.fetch??fetch)(`${this.config.baseUrl.replace(/\/$/,"")}/messages`,{method:"POST",headers:{"content-type":"application/json","x-api-key":this.config.apiKey,"anthropic-version":"2023-06-01",...this.config.headers,...this.config.requestHeaders?.(request)},body:JSON.stringify(body),signal});if(response.status===401||response.status===403)throw new ModelAuthenticationFailed();if(response.status===402)throw new ProviderQuotaExhausted("PROVIDER_MEMBERSHIP_UNAVAILABLE");if(response.status===429)throw new ProviderRateLimited();if(!response.ok)throw Object.assign(new Error(`Model endpoint returned ${response.status}.`),{status:response.status});if(streaming&&/event-stream/.test(response.headers.get("content-type")??""))return await this.readStream(response,request,deadline!);const payload=await readJsonBody(response,this.config.maxResponseBytes);const text=payload.content?.filter((item:any)=>item.type==="text").map((item:any)=>item.text).join("");if(typeof text!=="string"||!text)throw new InvalidStructuredResponse("Model response had no text content.");return{text,usage:{inputTokens:finite(payload.usage?.input_tokens),outputTokens:finite(payload.usage?.output_tokens)},rawResponseId:typeof payload.id==="string"?payload.id:undefined}}catch(error){if(error instanceof ModelAuthenticationFailed||error instanceof ProviderQuotaExhausted||error instanceof ProviderRateLimited||error instanceof InvalidStructuredResponse||error instanceof ModelResponseTooLarge)throw error;if(signal.aborted&&!request.signal?.aborted)throw new ModelTimeout();throw error instanceof Error&&"status" in error?error:new ModelUnavailable(error instanceof Error?error.message:String(error))}finally{deadline?.dispose()}
  }

  /** Messages streaming: `text_delta` for the answer and `thinking_delta` for extended thinking. */
  private async readStream(response:Response,request:ModelRequest,deadline:ReturnType<typeof streamDeadline>):Promise<NormalizedTransportResponse>{
    let text="",reasoning="",id:string|undefined,inputTokens:number|undefined,outputTokens:number|undefined
    await readSse(response,(data)=>{
      const event=parseJsonEvent(data)
      if(!event)return
      if(event.type==="error")throw new ModelUnavailable(typeof event.error?.message==="string"?event.error.message:"stream error")
      if(event.type==="message_start"){id=typeof event.message?.id==="string"?event.message.id:undefined;inputTokens=finite(event.message?.usage?.input_tokens)}
      else if(event.type==="message_delta")outputTokens=finite(event.usage?.output_tokens)??outputTokens
      else if(event.type==="content_block_delta"){
        if(event.delta?.type==="text_delta"&&typeof event.delta.text==="string"){text+=event.delta.text;request.onDelta?.({text:event.delta.text})}
        else if(event.delta?.type==="thinking_delta"&&typeof event.delta.thinking==="string"){reasoning+=event.delta.thinking;request.onDelta?.({reasoning:event.delta.thinking})}
      }
    },{touch:deadline.touch})
    if(!text)throw new InvalidStructuredResponse("Model response had no text content.")
    return{text,usage:{inputTokens,outputTokens},rawResponseId:id,...(reasoning?{reasoning}:{})}
  }
}
const finite=(value:unknown)=>typeof value==="number"&&Number.isFinite(value)?value:undefined
