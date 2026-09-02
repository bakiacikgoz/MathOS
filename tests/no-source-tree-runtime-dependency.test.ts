import { expect,test } from "bun:test"
import { resolveRuntimeLayout } from "@mathos/shared"

test("standalone production layout has no source checkout dependency",()=>{
  const layout=resolveRuntimeLayout({platform:"linux",home:"/clean-home",executablePath:"/release/bin/mathos",env:{},cwd:"/unrelated"})
  const serialized=JSON.stringify(layout)
  for(const sourcePath of ["/packages/","/benchmarks/","/demo/","/.tools/"])expect(serialized).not.toContain(sourcePath)
})
