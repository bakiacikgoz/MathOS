import { expect, test } from "bun:test"
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { uninstallMathOS } from "../packages/update/src/index.ts"
test("default uninstall removes product files but preserves workspace and user data",()=>{const root=mkdtempSync(join(tmpdir(),"mathos-uninstall-")),bin=join(root,"bin"),data=join(root,"data"),workspace=join(root,"research");mkdirSync(bin);mkdirSync(data);mkdirSync(workspace);writeFileSync(join(bin,"mathos"),"x");uninstallMathOS({binary:join(bin,"mathos"),productData:join(data,"runtime"),userData:data,workspaces:[workspace],purge:false});expect(existsSync(join(bin,"mathos"))).toBe(false);expect(existsSync(data)).toBe(true);expect(existsSync(workspace)).toBe(true)})
