import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { JsonRpcProcess } from "./jsonrpc-process.ts"
import type { ProcessSupervisorOptions } from "./process-supervisor.ts"

export interface AcpPromptResult{stopReason:string|null;text:string;reasoning:string;usage:unknown|null;meta:Record<string,unknown>|null}
type AcpDelta=(delta:{text?:string;reasoning?:string})=>void
interface Turn{text:string;reasoning:string;onDelta?:AcpDelta}

/**
 * Agent Client Protocol v1 client (Gemini CLI, Qwen Code). The answer arrives as `session/update` notifications;
 * `session/prompt` only returns the stop reason. MathOS grants no filesystem, terminal or MCP access and declines
 * every permission request the agent sends.
 */
export class AcpClient{
  private readonly rpc:JsonRpcProcess;private readonly scratch:string;private initialized=false;private readonly turns=new Map<string,Turn>()
  authMethods:Array<{id:string;name?:string}>=[]
  constructor(options:Omit<ProcessSupervisorOptions,"onLine"|"cwd">){this.scratch=mkdtempSync(join(tmpdir(),"mathos-acp-"));this.rpc=new JsonRpcProcess({...options,cwd:this.scratch,onNotification:(method,params)=>this.notification(method,params),onRequest:(method,params)=>this.request(method,params)})}
  start():void{this.rpc.start()}
  async initialize(clientInfo={name:"MathOS",version:"1.0"}){const result:any=await this.rpc.request("initialize",{protocolVersion:1,clientCapabilities:{fs:{readTextFile:false,writeTextFile:false},terminal:false},clientInfo});this.authMethods=Array.isArray(result?.authMethods)?result.authMethods.filter((method:any)=>typeof method?.id==="string"):[];this.initialized=true;return result}
  /** ACP requires a method id; agents with cached credentials need no authenticate call at all. */
  async authenticate(methodId:string){this.requireInitialized();if(!methodId)throw new Error("ACP_AUTH_METHOD_REQUIRED");return this.rpc.request("authenticate",{methodId})}
  async newSession(){this.requireInitialized();try{return await this.rpc.request<{sessionId:string}>("session/new",{cwd:this.scratch,mcpServers:[]})}catch(error){throw authError(error)}}
  async prompt(sessionId:string,text:string,options:{signal?:AbortSignal;timeoutMs?:number;onDelta?:AcpDelta}={}):Promise<AcpPromptResult>{
    this.requireInitialized();const turn:Turn={text:"",reasoning:"",onDelta:options.onDelta};this.turns.set(sessionId,turn)
    const onAbort=()=>{try{this.cancel(sessionId)}catch{}};options.signal?.addEventListener("abort",onAbort,{once:true})
    try{const result:any=await this.rpc.request("session/prompt",{sessionId,prompt:[{type:"text",text}]},{signal:options.signal,timeoutMs:options.timeoutMs});return{stopReason:typeof result?.stopReason==="string"?result.stopReason:null,text:turn.text,reasoning:turn.reasoning,usage:result?.usage??null,meta:result?._meta&&typeof result._meta==="object"?result._meta:null}}
    catch(error){throw authError(error)}
    finally{options.signal?.removeEventListener("abort",onAbort);this.turns.delete(sessionId)}
  }
  cancel(sessionId:string):void{this.rpc.notify("session/cancel",{sessionId})}
  async stop():Promise<void>{await this.rpc.stop();rmSync(this.scratch,{recursive:true,force:true})}
  private requireInitialized(){if(!this.initialized)throw new Error("ACP_NOT_INITIALIZED")}
  private notification(method:string,params:any){
    if(method!=="session/update")return
    const turn=this.turns.get(params?.sessionId),update=params?.update,content=update?.content
    if(!turn||content?.type!=="text"||typeof content.text!=="string"||!content.text)return
    if(update.sessionUpdate==="agent_message_chunk"){turn.text+=content.text;turn.onDelta?.({text:content.text})}
    else if(update.sessionUpdate==="agent_thought_chunk"){turn.reasoning+=content.text;turn.onDelta?.({reasoning:content.text})}
  }
  /** MathOS uses the agent as a text model only: tool permissions are declined, file and terminal requests are unsupported. */
  private request(method:string,params:any){
    if(method!=="session/request_permission")return undefined
    const options:Array<{optionId?:string;kind?:string}>=Array.isArray(params?.options)?params.options:[]
    const reject=options.find(option=>option.kind==="reject_once")??options.find(option=>option.kind==="reject_always")
    return{outcome:reject?.optionId?{outcome:"selected",optionId:reject.optionId}:{outcome:"cancelled"}}
  }
}

/** The agent answers -32000 "Authentication required" (or names its missing credential) when its own sign-in is missing. */
function authError(error:unknown):unknown{const message=error instanceof Error?error.message:String(error);return /JSONRPC_ERROR: -32000\b/.test(message)?new Error(`ACP_AUTH_REQUIRED: ${message.replace(/^JSONRPC_ERROR: -32000\s*/,"")}`):error}
