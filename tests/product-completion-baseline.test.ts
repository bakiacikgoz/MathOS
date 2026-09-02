import { describe, expect, test } from "bun:test"
import { join } from "node:path"
import { captureProductBaseline, type BaselineCommandRunner } from "../scripts/product-completion/capture-baseline.ts"

describe("product completion baseline", () => {
  test("records exact provenance and fails closed without writing outside the artifact root", async () => {
    const calls:string[][]=[]
    const runner:BaselineCommandRunner=async command=>{
      calls.push(command)
      if(command[0]==="git") return {exitCode:0,stdout:"541e39ef6454ffd7b3934348ccb457f067b28f31\n",stderr:""}
      if(command.includes("--version")) return {exitCode:0,stdout:"MathOS 0.1.0-alpha.1\n",stderr:""}
      if(command.includes("--json")) return {exitCode:0,stdout:'{"ready":true}',stderr:""}
      return {exitCode:0,stdout:"1 pass\n",stderr:""}
    }
    const writes:Array<{path:string;data:string}>=[]
    const root=join(import.meta.dir,"..")
    const result=await captureProductBaseline({root,runner,write:(path,data)=>writes.push({path,data})})
    expect(result.baselineReference).toBe("541e39ef6454ffd7b3934348ccb457f067b28f31")
    expect(result.gitRevision).toBe("541e39ef6454ffd7b3934348ccb457f067b28f31")
    expect(result.versions).toEqual({product:"0.1.0-alpha.1",schema:30,bridge:1,pluginApi:1,capsule:1,publication:1})
    expect(result.checks.every(check=>check.status==="PASS")).toBe(true)
    expect(writes).toHaveLength(1)
    expect(writes[0]!.path).toBe(join(root,"artifacts","product-completion","baseline.json"))
    expect(JSON.parse(writes[0]!.data).gitRevision).toBe(result.gitRevision)
    expect(calls.some(command=>command.includes("release-check"))).toBe(true)
  })

  test("does not turn a failed command into baseline PASS", async () => {
    const runner:BaselineCommandRunner=async command=>command[0]==="git"
      ? {exitCode:0,stdout:"541e39ef6454ffd7b3934348ccb457f067b28f31\n",stderr:""}
      : {exitCode:2,stdout:"",stderr:"failed"}
    const result=await captureProductBaseline({root:join(import.meta.dir,".."),runner,write:()=>{}})
    expect(result.ready).toBe(false)
    expect(result.checks.some(check=>check.status==="FAIL"&&check.evidence==="failed")).toBe(true)
  })
})
