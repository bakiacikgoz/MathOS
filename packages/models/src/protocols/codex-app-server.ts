import{mkdtempSync,rmSync}from"node:fs";import{tmpdir}from"node:os";import{join}from"node:path";import{JsonRpcProcess}from"../transports/jsonrpc-process.ts"
export const CODEX_REQUIRED_METHODS=["initialize","account/read","account/login/start","account/logout","thread/start","turn/start","thread/archive"]as const
export interface CodexSchema{methods?:Array<{name?:string}>;requests?:Record<string,unknown>;[key:string]:unknown}
export function validateCodexSchema(schema:CodexSchema):true{const methods=new Set([...(schema.methods??[]).map(row=>row.name),...Object.keys(schema.requests??{})]);const visit=(value:unknown,key="")=>{if(Array.isArray(value)){if(key==="enum")for(const item of value)if(typeof item==="string")methods.add(item);for(const item of value)visit(item)}else if(value&&typeof value==="object")for(const [childKey,child]of Object.entries(value))visit(child,childKey)};visit(schema);for(const required of CODEX_REQUIRED_METHODS)if(!methods.has(required))throw new Error(`CODEX_SCHEMA_METHOD_MISSING: ${required}`);return true}
export class CodexAppServerClient{
 private readonly rpc:JsonRpcProcess;private readonly scratch:string;private messages:string[]=[];private protocolViolation:string|null=null;private turnDone:(()=>void)|null=null
 constructor(executable:string,args:string[]=["app-server"],options:{env?:NodeJS.ProcessEnv;schema:CodexSchema;version:string;timeoutMs?:number;setTimeout?:typeof setTimeout;clearTimeout?:typeof clearTimeout}){validateCodexSchema(options.schema);this.scratch=mkdtempSync(join(tmpdir(),"mathos-codex-"));this.rpc=new JsonRpcProcess({executable,args,cwd:this.scratch,env:options.env,onNotification:(method,params)=>this.notification(method,params),documentedAuthEnv:[],omitVersionHeader:true});this.version=options.version;this.timeoutMs=options.timeoutMs??60_000;this.schedule=options.setTimeout??setTimeout;this.cancel=options.clearTimeout??clearTimeout}
 private readonly version:string;private readonly timeoutMs:number;private readonly schedule:typeof setTimeout;private readonly cancel:typeof clearTimeout
 start(){this.rpc.start()}
 async initialize(){const result=await this.rpc.request("initialize",{clientInfo:{name:"mathos_model_bridge",title:"MathOS Model Provider Bridge",version:this.version},capabilities:{experimentalApi:false}});this.rpc.notify("initialized");return result}
 account(){return this.rpc.request<any>("account/read",{refreshToken:false})}
 login(type:"chatgpt"|"chatgptDeviceCode"){return this.rpc.request<any>("account/login/start",{type})}
 logout(confirmed:boolean){if(!confirmed)throw new Error("CODEX_LOGOUT_CONFIRMATION_REQUIRED");return this.rpc.request("account/logout",{})}
 async infer(input:{model:string;messages:Array<{role:string;content:string}>;signal?:AbortSignal}){
  this.messages=[];this.protocolViolation=null
  const thread:any=await this.rpc.request("thread/start",{ephemeral:true,cwd:this.scratch,approvalPolicy:"never",sandbox:"read-only",config:{default_tools_enabled:false},baseInstructions:"Act only as a text generation model. Do not call tools, commands, files, shells, skills, or external services. Return the requested answer directly."})
  const threadId=thread.thread?.id??thread.threadId;if(!threadId)throw new Error("CODEX_THREAD_ID_MISSING")
  let timedOut=false,timeoutHandle:ReturnType<typeof setTimeout>|null=null
  try{
   let resolveDone!:()=>void;const done=new Promise<void>(resolve=>{resolveDone=resolve});this.turnDone=resolveDone
   const result:any=await this.rpc.request("turn/start",{threadId,model:input.model,input:input.messages.map(message=>({type:"text",text:message.content}))},{signal:input.signal})
   if(!this.messages.length&&!this.protocolViolation)await Promise.race([done,new Promise<never>((_,reject)=>{timeoutHandle=this.schedule(()=>{timedOut=true;reject(new Error("CODEX_TURN_TIMEOUT"))},this.timeoutMs)})])
   if(this.protocolViolation)throw new Error(this.protocolViolation)
   const text=this.messages.join("")||result.agentMessage||result.text;if(!text)throw new Error("CODEX_RESPONSE_EMPTY")
   return{text,usage:result.usage??null,threadId}
  }finally{
   this.turnDone=null
   if(timeoutHandle!==null)this.cancel(timeoutHandle)
   if(!timedOut)await this.rpc.request("thread/archive",{threadId}).catch(()=>undefined)
  }
 }
 models(){return this.rpc.request<any>("model/list",{})}
 rateLimits(){return this.rpc.request<any>("account/rateLimits/read",{})}
 async stop(){await this.rpc.stop();rmSync(this.scratch,{recursive:true,force:true})}
 private notification(method:string,params:any){if(method==="item/agentMessage/delta"||method==="agentMessage/delta")this.messages.push(String(params?.delta??params?.text??""));if(method==="turn/completed")this.turnDone?.();if(/command|shell|file.*(write|edit)|tool.*request/i.test(`${method} ${params?.type??""}`)){this.protocolViolation="CODEX_TOOL_REQUEST_FORBIDDEN";this.turnDone?.()}}
}
