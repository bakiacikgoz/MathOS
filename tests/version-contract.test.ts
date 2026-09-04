import { describe, expect, test } from "bun:test"
import { resolve } from "node:path"
import { MATHOS_PRODUCT_VERSION, assertProductVersionAlignment, currentBuildIdentity } from "@mathos/shared"

describe("canonical product identity",()=>{
  test("reports every compatibility version from one identity",()=>{
    expect(currentBuildIdentity({gitRevision:"0123456789abcdef0123456789abcdef01234567",buildId:"build-1"})).toEqual({
      productVersion:MATHOS_PRODUCT_VERSION,gitRevision:"0123456789abcdef0123456789abcdef01234567",buildId:"build-1",schemaVersion:30,
      bridgeProtocolVersion:1,pluginApiVersion:1,capsuleFormatVersion:1,publicationFormatVersion:1,
    })
  })
  test("rejects a package version that drifts from canonical identity",()=>{
    expect(()=>assertProductVersionAlignment([{name:"mathos",version:MATHOS_PRODUCT_VERSION},{name:"@mathos/atlas",version:"9.9.9"}])).toThrow("PRODUCT_VERSION_MISMATCH")
  })
  test("CLI version JSON is pure machine-readable build identity",()=>{
    const cli=Bun.spawnSync([process.execPath,resolve(import.meta.dir,"../apps/tui/src/cli.ts"),"--version","--json"],{stdout:"pipe",stderr:"pipe"})
    expect(cli.exitCode).toBe(0)
    const identity=JSON.parse(new TextDecoder().decode(cli.stdout))
    expect(identity.productVersion).toBe(MATHOS_PRODUCT_VERSION)
    expect(identity.gitRevision).toMatch(/^[0-9a-f]{40}$|^UNKNOWN$/)
    expect(identity.schemaVersion).toBe(30)
  }, 30000)
})
