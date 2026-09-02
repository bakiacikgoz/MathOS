import { expect, test } from "bun:test"
import { planCapsuleImport } from "../packages/core/src/capsule-replay.ts"
test("dry-run is mutation-free and requires new workspace or branch on conflict",()=>{let writes=0;const plan=planCapsuleImport({formatVersion:1,workspaceSchemaVersion:24,hashesValid:true,plugins:["p@1"],toolchains:{lean:"4"}},{workspaceSchemaVersion:24,plugins:[],toolchains:{lean:"4"}},{targetEmpty:false});expect(writes).toBe(0);expect(plan).toMatchObject({dryRun:true,status:"CONFLICT",allowedTargets:["NEW_WORKSPACE","NEW_BRANCH"]});expect(plan.missing).toContain("PLUGIN:p@1")})
