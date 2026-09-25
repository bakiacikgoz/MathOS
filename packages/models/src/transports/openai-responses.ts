import { InvalidStructuredResponse, ModelAuthenticationFailed, ModelResponseTooLarge, ModelTimeout, ModelUnavailable } from "../errors.ts"
import type { ModelRequest } from "../types.ts"
import type { HttpTransportConfig, NormalizedTransport, NormalizedTransportResponse } from "./types.ts"
import { readJsonBody } from "./structured-output.ts"
import { parseJsonEvent, readSse, streamDeadline } from "./sse.ts"

export class OpenAIResponsesTransport implements NormalizedTransport {
  readonly protocol = "openai-responses" as const
  constructor(private readonly config: HttpTransportConfig) {}
  async generate(request: ModelRequest): Promise<NormalizedTransportResponse> {
    const streaming=Boolean(request.onDelta)&&!request.responseSchema,deadline=streaming?streamDeadline(this.config.timeoutMs??60_000,request.signal):null
    const timeout=AbortSignal.timeout(this.config.timeoutMs??60_000),signal=deadline?.signal??(request.signal?AbortSignal.any([request.signal,timeout]):timeout)
    const body:Record<string,unknown>={model:this.config.model,input:request.messages.map(message=>({role:message.role,content:message.content}))}
    if(request.maxOutputTokens!==undefined)body.max_output_tokens=request.maxOutputTokens
    if(request.reasoningEffort&&request.reasoningEffort!=="none")body.reasoning={effort:request.reasoningEffort,...(streaming?{summary:"auto"}:{})}
    if(streaming)body.stream=true
    if(request.responseSchema)body.text={format:{type:"json_schema",name:request.responseSchema.name,strict:true,schema:request.responseSchema.jsonSchema}}
    try{const response=await(this.config.fetch??fetch)(`${this.config.baseUrl.replace(/\/$/,"")}/responses`,{method:"POST",headers:{"content-type":"application/json",authorization:`Bearer ${this.config.apiKey}`,...this.config.headers,...this.config.requestHeaders?.(request)},body:JSON.stringify(body),signal});if(response.status===401||response.status===403)throw new ModelAuthenticationFailed();if(!response.ok)throw Object.assign(new Error(`Model endpoint returned ${response.status}.`),{status:response.status});if(streaming&&/event-stream/.test(response.headers.get("content-type")??""))return await this.readStream(response,request,deadline!);const payload=await readJsonBody(response,this.config.maxResponseBytes);const text=typeof payload.output_text==="string"?payload.output_text:payload.output?.flatMap((item:any)=>item.content??[]).find((item:any)=>item.type==="output_text")?.text;if(typeof text!=="string"||!text)throw new InvalidStructuredResponse("Model response had no output text.");return{text,usage:{inputTokens:finite(payload.usage?.input_tokens),outputTokens:finite(payload.usage?.output_tokens)},rawResponseId:typeof payload.id==="string"?payload.id:undefined}}catch(error){if(error instanceof ModelAuthenticationFailed||error instanceof InvalidStructuredResponse||error instanceof ModelResponseTooLarge)throw error;if(signal.aborted&&!request.signal?.aborted)throw new ModelTimeout();throw error instanceof Error&&"status" in error?error:new ModelUnavailable(error instanceof Error?error.message:String(error))}finally{deadline?.dispose()}
  }

  /** Responses streaming: output text deltas, reasoning summary deltas, and usage on completion. */
  private async readStream(response:Response,request:ModelRequest,deadline:ReturnType<typeof streamDeadline>):Promise<NormalizedTransportResponse>{
    let text="",reasoning="",id:string|undefined,inputTokens:number|undefined,outputTokens:number|undefined
    await readSse(response,(data,name)=>{
      const event=parseJsonEvent(data)
      if(!event)return
      const type=event.type??name
      if(type==="error"||type==="response.failed")throw new ModelUnavailable(typeof event.error?.message==="string"?event.error.message:typeof event.response?.error?.message==="string"?event.response.error.message:"stream error")
      if(type==="response.output_text.delta"&&typeof event.delta==="string"){text+=event.delta;request.onDelta?.({text:event.delta})}
      else if((type==="response.reasoning_summary_text.delta"||type==="response.reasoning_text.delta")&&typeof event.delta==="string"){reasoning+=event.delta;request.onDelta?.({reasoning:event.delta})}
      else if(type==="response.completed"){id=typeof event.response?.id==="string"?event.response.id:id;inputTokens=finite(event.response?.usage?.input_tokens);outputTokens=finite(event.response?.usage?.output_tokens)}
    },{touch:deadline.touch})
    if(!text)throw new InvalidStructuredResponse("Model response had no output text.")
    return{text,usage:{inputTokens,outputTokens},rawResponseId:id,...(reasoning?{reasoning}:{})}
  }
}
const finite=(value:unknown)=>typeof value==="number"&&Number.isFinite(value)?value:undefined
