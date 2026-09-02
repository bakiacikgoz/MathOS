import { describe,expect,test } from "bun:test"
import { resolveRuntimeLayout } from "@mathos/shared"

describe("standalone runtime layout",()=>{
  test("resolves installation assets relative to executable and user state to platform roots",()=>{
    expect(resolveRuntimeLayout({platform:"linux",home:"/home/researcher",executablePath:"/opt/mathos/bin/mathos",env:{XDG_CONFIG_HOME:"/cfg",XDG_DATA_HOME:"/data",XDG_CACHE_HOME:"/cache",XDG_STATE_HOME:"/state"}})).toEqual({
      executablePath:"/opt/mathos/bin/mathos",installationRoot:"/opt/mathos",sharedAssetsRoot:"/opt/mathos/share/mathos",userConfigRoot:"/cfg/mathos",userDataRoot:"/data/mathos",userCacheRoot:"/cache/mathos",userLogRoot:"/state/mathos/logs",
    })
  })
  test("never derives runtime assets from cwd or source directories",()=>{
    const layout=resolveRuntimeLayout({platform:"darwin",home:"/Users/researcher",executablePath:"/Applications/MathOS/bin/mathos",env:{},cwd:"/tmp/source/packages/core"})
    expect(layout.sharedAssetsRoot).toBe("/Applications/MathOS/share/mathos")
    expect(JSON.stringify(layout)).not.toContain("packages/core")
  })
})
