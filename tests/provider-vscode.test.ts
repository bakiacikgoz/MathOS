import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { BridgeService } from "@mathos/core"
import { BridgeClient } from "../apps/vscode-extension/src/bridge-client.ts"

describe("VS Code provider bridge", () => {
  test("requests provider capabilities through the existing bridge", async () => {
    const client=new BridgeClient({workspaceRoot:process.cwd(),trusted:true}), hello=client.hello()
    expect(hello.requestedCapabilities).toEqual(expect.arrayContaining(["providers.read","providers.select"]))
    const rows=[{profile:"main",descriptor:"openai-api",connection:"CONFIGURED",model:"gpt-5",billing:"payg",terms:"STANDARD_API",quota:"unknown",roles:["planner"]}]
    const bridge=new BridgeService({workspaceRoot:process.cwd(),workspaceId:"W",trusted:true,handlers:{"providers.list":async()=>rows}})
    await bridge.handle({id:"h",method:"hello",params:hello}); const response=await bridge.handle({id:"p",method:"providers.list",params:{}})
    expect(response.result).toEqual(rows); expect(JSON.stringify(response)).not.toMatch(/secretRef|apiKey/i)
  })
  test("packages the four provider commands and provider tree", () => {
    const manifest=JSON.parse(readFileSync(resolve(import.meta.dir,"../apps/vscode-extension/package.json"),"utf8")), commands=manifest.contributes.commands.map((row:{title:string})=>row.title)
    expect(commands).toEqual(expect.arrayContaining(["MathOS: Show Model Providers","MathOS: Select Model Profile","MathOS: Refresh Provider Status","MathOS: Show Provider Quota"]))
    expect(manifest.contributes.views.mathos.map((row:{id:string})=>row.id)).toContain("mathosProviders")
  })
})
