import{mkdtempSync,rmSync}from"node:fs";import{tmpdir}from"node:os";import{join}from"node:path";import{JsonRpcProcess}from"../transports/jsonrpc-process.ts"
export const CODEX_REQUIRED_METHODS=["initialize","account/read","account/login/start","account/logout","thread/start","turn/start","thread/archive"]as const
export interface CodexSchema{methods?:Array<{name?:string}>;requests?:Record<string,unknown>;[key:string]:unknown}
export function validateCodexSchema(schema:CodexSchema):true{const methods=new Set([...(schema.methods??[]).map(row=>row.name),...Object.keys(schema.requests??{})]);const visit=(value:unknown,key="")=>{if(Array.isArray(value)){if(key==="enum")for(const item of value)if(typeof item==="string")methods.add(item);for(const item of value)visit(item)}else if(value&&typeof value==="object")for(const [childKey,child]of Object.entries(value))visit(child,childKey)};visit(schema);for(const required of CODEX_REQUIRED_METHODS)if(!methods.has(required))throw new Error(`CODEX_SCHEMA_METHOD_MISSING: ${required}`);return true}
export class CodexAppServerClient{
 private readonly rpc:JsonRpcProcess;private readonly scratch:string;private messages:string[]=[];private reasoning="";private summaryIndex:string|null=null;private onDelta:((delta:{text?:string;reasoning?:string})=>void)|null=null;private protocolViolation:string|null=null;private turnError:string|null=null;private completed=false;private turnDone:(()=>void)|null=null
 constructor(executable:string,args:string[]=["app-server"],options:{env?:NodeJS.ProcessEnv;schema:CodexSchema;version:string;timeoutMs?:number;setTimeout?:typeof setTimeout;clearTimeout?:typeof clearTimeout}){validateCodexSchema(options.schema);this.scratch=mkdtempSync(join(tmpdir(),"mathos-codex-"));this.rpc=new JsonRpcProcess({executable,args,cwd:this.scratch,env:options.env,onNotification:(method,params)=>this.notification(method,params),onRequest:method=>this.serverRequest(method),documentedAuthEnv:["CODEX_HOME"],omitVersionHeader:true});this.version=options.version;this.timeoutMs=options.timeoutMs??60_000;this.schedule=options.setTimeout??setTimeout;this.cancel=options.clearTimeout??clearTimeout}
 private readonly version:string;private readonly timeoutMs:number;private readonly schedule:typeof setTimeout;private readonly cancel:typeof clearTimeout
 start(){this.rpc.start()}
 async initialize(){const result=await this.rpc.request("initialize",{clientInfo:{name:"mathos_model_bridge",title:"MathOS Model Provider Bridge",version:this.version},capabilities:{experimentalApi:false}});this.rpc.notify("initialized");return result}
 account(){return this.rpc.request<any>("account/read",{refreshToken:false})}
 login(type:"chatgpt"|"chatgptDeviceCode"){return this.rpc.request<any>("account/login/start",{type})}
 logout(confirmed:boolean){if(!confirmed)throw new Error("CODEX_LOGOUT_CONFIRMATION_REQUIRED");return this.rpc.request("account/logout",{})}
 async infer(input:{model?:string;messages:Array<{role:string;content:string}>;signal?:AbortSignal;effort?:string;onDelta?:(delta:{text?:string;reasoning?:string})=>void}){
  this.messages=[];this.reasoning="";this.summaryIndex=null;this.protocolViolation=null;this.turnError=null;this.completed=false;this.onDelta=input.onDelta??null
  const thread:any=await this.rpc.request("thread/start",{ephemeral:true,cwd:this.scratch,approvalPolicy:"never",sandbox:"read-only",config:{default_tools_enabled:false},baseInstructions:"Act only as a text generation model. Do not call tools, commands, files, shells, skills, or external services. Return the requested answer directly."})
  const threadId=thread.thread?.id??thread.threadId;if(!threadId)throw new Error("CODEX_THREAD_ID_MISSING")
  let timedOut=false,timeoutHandle:ReturnType<typeof setTimeout>|null=null
  try{
   let resolveDone!:()=>void;const done=new Promise<void>(resolve=>{resolveDone=resolve});this.turnDone=resolveDone
   const result:any=await this.rpc.request("turn/start",{threadId,model:input.model,...(input.effort?{effort:input.effort}:{}),summary:"auto",input:input.messages.map(message=>({type:"text",text:message.content}))},{signal:input.signal})
   // Deltas can arrive before turn/completed; only the completion (or a failure) ends the turn, never the first delta.
   const turnId=result?.turn?.id,interrupt=()=>{if(turnId)this.rpc.request("turn/interrupt",{threadId,turnId}).catch(()=>undefined)}
   if(!this.completed&&!this.protocolViolation&&!this.turnError){let onAbort:(()=>void)|null=null;try{await Promise.race([done,new Promise<never>((_,reject)=>{timeoutHandle=this.schedule(()=>{timedOut=true;interrupt();reject(new Error("CODEX_TURN_TIMEOUT"))},this.timeoutMs)}),...(input.signal?[new Promise<never>((_,reject)=>{onAbort=()=>{interrupt();reject(new Error("JSONRPC_REQUEST_CANCELLED"))};if(input.signal!.aborted)onAbort();else input.signal!.addEventListener("abort",onAbort,{once:true})})]:[])])}finally{if(onAbort)input.signal?.removeEventListener("abort",onAbort)}}
   if(this.protocolViolation)throw new Error(this.protocolViolation)
   if(this.turnError)throw new Error(this.turnError)
   const text=this.messages.join("")||result.agentMessage||result.text;if(!text)throw new Error("CODEX_RESPONSE_EMPTY")
   return{text,usage:result.usage??null,threadId,...(this.reasoning?{reasoning:this.reasoning}:{})}
  }finally{
   this.turnDone=null;this.onDelta=null
   if(timeoutHandle!==null)this.cancel(timeoutHandle)
   if(!timedOut)await this.rpc.request("thread/archive",{threadId}).catch(()=>undefined)
  }
 }
 models(){return this.rpc.request<any>("model/list",{})}
 rateLimits(){return this.rpc.request<any>("account/rateLimits/read",{})}
 async stop(){await this.rpc.stop();rmSync(this.scratch,{recursive:true,force:true})}
 /** Summary sections arrive as separate parts; a blank line keeps them apart in the transcript. */
 private reasoningDelta(section:string,delta:string){if(!delta)return;const text=this.summaryIndex!==null&&this.summaryIndex!==section&&this.reasoning?`\n\n${delta}`:delta;this.summaryIndex=section;this.reasoning+=text;this.onDelta?.({reasoning:text})}
 /** Approval requests (commands, file changes, tools) mean Codex tried to act; the request is declined and the turn fails. */
 private serverRequest(method:string):undefined{if(/command|shell|file|patch|tool|permission/i.test(method)){this.protocolViolation="CODEX_TOOL_REQUEST_FORBIDDEN";this.turnDone?.()}return undefined}
 private notification(method:string,params:any){if(method==="item/agentMessage/delta"||method==="agentMessage/delta"){const text=String(params?.delta??params?.text??"");this.messages.push(text);if(text)this.onDelta?.({text})}if(method==="item/reasoning/summaryTextDelta"||method==="item/reasoning/textDelta")this.reasoningDelta(`${params?.itemId}:${params?.summaryIndex??params?.contentIndex??0}`,String(params?.delta??""));if(method==="error"&&!params?.willRetry)this.turnError??=codexTurnError(params?.error);if(method==="turn/completed"){this.completed=true;if(params?.turn?.status==="failed")this.turnError??=codexTurnError(params.turn.error);this.turnDone?.()}if(/command|shell|file.*(write|edit)|tool.*request/i.test(`${method} ${params?.type??""}`)){this.protocolViolation="CODEX_TOOL_REQUEST_FORBIDDEN";this.turnDone?.()}}
}

/** A failed Codex turn (expired sign-in, plan usage limit...) as a stable code plus the client's own message. */
const CODEX_TURN_ERRORS:Record<string,string>={unauthorized:"CODEX_LOGIN_REQUIRED",usageLimitExceeded:"CODEX_USAGE_LIMIT_EXCEEDED",rateLimitExceeded:"CODEX_RATE_LIMITED",contextWindowExceeded:"CODEX_CONTEXT_WINDOW_EXCEEDED",serverOverloaded:"CODEX_SERVER_OVERLOADED"}
export function codexTurnError(error:any):string{const info=error?.codexErrorInfo,kind=typeof info==="string"?info:info&&typeof info==="object"?Object.keys(info)[0]??"other":"other",message=typeof error?.message==="string"?error.message.trim():"";return`${CODEX_TURN_ERRORS[kind]??"CODEX_TURN_FAILED"}${message?`: ${message}`:""}`}
