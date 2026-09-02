import { expect, test } from "bun:test"
import { checkUpdate } from "../packages/update/src/index.ts"
test("update check respects channel and compatibility",()=>{expect(checkUpdate({currentVersion:"1.0.0-rc.1",channel:"rc",manifest:{version:"1.0.0-rc.2",channel:"rc",minimumSchema:1,maximumSchema:30,sha256:"a".repeat(64)},schemaVersion:24})).toMatchObject({available:true,compatible:true});expect(checkUpdate({currentVersion:"1.0.0",channel:"stable",manifest:{version:"1.1.0-rc.1",channel:"rc",minimumSchema:1,maximumSchema:30,sha256:"a".repeat(64)},schemaVersion:24}).available).toBe(false)})
