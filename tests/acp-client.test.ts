import { describe,expect,test } from "bun:test"
import { AcpClient } from "@mathos/models"
import { resolve } from "node:path"
const fixture=resolve(import.meta.dir,"fixtures/provider-process/fake-acp.ts")

describe("ACP client",()=>{
 test("negotiates ACP v1 without filesystem, terminal or MCP grants and streams the answer from session/update",async()=>{const client=new AcpClient({executable:process.execPath,args:[fixture]});client.start();try{const initialized:any=await client.initialize();expect(initialized.received.clientCapabilities).toEqual({fs:{readTextFile:false,writeTextFile:false},terminal:false});expect(client.authMethods.map(method=>method.id)).toEqual(["oauth-personal"]);await expect(client.authenticate("")).rejects.toThrow("ACP_AUTH_METHOD_REQUIRED");expect(await client.authenticate("oauth-personal")).toEqual({});const session:any=await client.newSession();expect(session.sessionId).toBe("session-1");expect(session.received.mcpServers).toEqual([]);const deltas:unknown[]=[];const response=await client.prompt(session.sessionId,"prove it",{onDelta:delta=>deltas.push(delta)});expect(response.text).toBe("answer");expect(response.reasoning).toBe("thinking");expect(response.stopReason).toBe("end_turn");expect(deltas).toEqual([{reasoning:"thinking"},{text:"ans"},{text:"wer"}]);client.cancel(session.sessionId)}finally{await client.stop()}},20_000)
 test("declines the agent's tool permission request instead of leaving it unanswered",async()=>{const client=new AcpClient({executable:process.execPath,args:[fixture]});client.start();try{await client.initialize();const session=await client.newSession();const response:any=await client.prompt(session.sessionId,"x");expect(response.text).toBe("answer")}finally{await client.stop()}},20_000)
})
