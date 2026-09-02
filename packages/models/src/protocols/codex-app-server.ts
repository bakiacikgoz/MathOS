import{mkdtempSync,rmSync}from"node:fs";import{tmpdir}from"node:os";import{join}from"node:path";import{JsonRpcProcess}from"../transports/jsonrpc-process.ts"
export const CODEX_REQUIRED_METHODS=["initialize","account/read","account/login/start","account/logout","thread/start","turn/start","thread/archive"]as const
export interface CodexSchema{methods?:Array<{name?:string}>;requests?:Record<string,unknown>}
export function validateCodexSchema(schema:CodexSchema):true{const methods=new Set([...(schema.methods??[]).map(row=>row.name),...Object.keys(schema.requests??{})]);for(const required of CODEX_REQUIRED_METHODS)if(!methods.has(required))throw new Error(`CODEX_SCHEMA_METHOD_MISSING: ${required}`);return true}
export class CodexAppServerClient{
 private readonly rpc:JsonRpcProcess;private readonly scratch:string;private messages:string[]=[];private protocolViolation:string|null=null
 constructor(executable:string,args:string[]=["app-server"],options:{env?:NodeJS.ProcessEnv;schema:CodexSchema;version:string}){validateCodexSchema(options.schema);this.scratch=mkdtempSync(join(tmpdir(),"mathos-codex-"));this.rpc=new JsonRpcProcess({executable,args,cwd:this.scratch,env:options.env,onNotification:(method,params)=>this.notification(method,params),documentedAuthEnv:[]});this.version=options.version}
 private readonly version:string
 start(){this.rpc.start()}
 initialize(){return this.rpc.request("initialize",{clientInfo:{name:"mathos_model_bridge",title:"MathOS Model Provider Bridge",version:this.version},capabilities:{experimentalApi:false}})}
 account(){return this.rpc.request<any>("account/read",{refreshToken:false})}
 login(type:"chatgpt"|"chatgptDeviceCode"){return this.rpc.request<any>("account/login/start",{type})}
 logout(confirmed:boolean){if(!confirmed)throw new Error("CODEX_LOGOUT_CONFIRMATION_REQUIRED");return this.rpc.request("account/logout",{})}
 async infer(input:{model:string;messages:Array<{role:string;content:string}>;signal?:AbortSignal}){this.messages=[];this.protocolViolation=null;const thread:any=await this.rpc.request("thread/start",{ephemeral:true,cwd:this.scratch,approvalPolicy:"never",sandbox:"read-only",tools:[]});const threadId=thread.thread?.id??thread.threadId;if(!threadId)throw new Error("CODEX_THREAD_ID_MISSING");try{const result:any=await this.rpc.request("turn/start",{threadId,model:input.model,input:input.messages.map(message=>({type:"text",text:message.content}))},{signal:input.signal});if(this.protocolViolation)throw new Error(this.protocolViolation);const text=this.messages.join("")||result.agentMessage||result.text;if(!text)throw new Error("CODEX_RESPONSE_EMPTY");return{text,usage:result.usage??null,threadId}}finally{await this.rpc.request("thread/archive",{threadId}).catch(()=>undefined)}}
 models(){return this.rpc.request<any>("model/list",{})}
 rateLimits(){return this.rpc.request<any>("account/rateLimits/read",{})}
 async stop(){await this.rpc.stop();rmSync(this.scratch,{recursive:true,force:true})}
 private notification(method:string,params:any){if(method==="item/agentMessage/delta"||method==="agentMessage/delta")this.messages.push(String(params?.delta??params?.text??""));if(/command|shell|file.*(write|edit)|tool.*request/i.test(`${method} ${params?.type??""}`))this.protocolViolation="CODEX_TOOL_REQUEST_FORBIDDEN"}
}
