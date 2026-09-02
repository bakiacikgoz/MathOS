import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { JsonRpcProcess } from "./jsonrpc-process.ts"
import type { ProcessSupervisorOptions } from "./process-supervisor.ts"

export class AcpClient{
  private readonly rpc:JsonRpcProcess;private readonly scratch:string;private initialized=false
  constructor(options:Omit<ProcessSupervisorOptions,"onLine"|"cwd">){this.scratch=mkdtempSync(join(tmpdir(),"mathos-acp-"));this.rpc=new JsonRpcProcess({...options,cwd:this.scratch})}
  start():void{this.rpc.start()}
  async initialize(clientInfo={name:"MathOS",version:"1.0"}){const result=await this.rpc.request("initialize",{protocolVersion:1,clientInfo,capabilities:{filesystem:false,mcp:false},workspaceRoot:this.scratch});this.initialized=true;return result}
  async authenticate(methodId?:string){this.requireInitialized();return this.rpc.request("authenticate",methodId?{methodId}:{})}
  async newSession(){this.requireInitialized();return this.rpc.request<{sessionId:string}>("session/new",{cwd:this.scratch,mcpServers:[]})}
  async prompt(sessionId:string,text:string,options:{signal?:AbortSignal;timeoutMs?:number}={}){this.requireInitialized();return this.rpc.request("session/prompt",{sessionId,prompt:[{type:"text",text}]},options)}
  cancel(sessionId:string):void{this.rpc.notify("session/cancel",{sessionId})}
  async stop():Promise<void>{await this.rpc.stop();rmSync(this.scratch,{recursive:true,force:true})}
  private requireInitialized(){if(!this.initialized)throw new Error("ACP_NOT_INITIALIZED")}
}
