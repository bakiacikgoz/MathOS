import { describe,expect,test } from "bun:test"
import { AcpClient } from "@mathos/models"
import { resolve } from "node:path"
const fixture=resolve(import.meta.dir,"fixtures/provider-process/fake-acp.ts")

describe("ACP client",()=>{test("runs initialize, authenticate, newSession, prompt and cancel without filesystem or MCP grants",async()=>{const client=new AcpClient({executable:process.execPath,args:[fixture]});client.start();try{const initialized:any=await client.initialize();expect(initialized.received.capabilities).toEqual({filesystem:false,mcp:false});expect(initialized.received.workspaceRoot).toContain("mathos-acp-");expect(await client.authenticate()).toEqual({ok:true});const session:any=await client.newSession();expect(session.sessionId).toBe("session-1");expect(session.received.mcpServers).toEqual([]);const response:any=await client.prompt(session.sessionId,"prove it");expect(response.received.prompt).toEqual([{type:"text",text:"prove it"}]);client.cancel(session.sessionId)}finally{await client.stop()}})})
