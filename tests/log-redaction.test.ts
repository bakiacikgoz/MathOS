import { expect, test } from "bun:test"
import { mkdtempSync, readFileSync, readdirSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { createLogger } from "@mathos/shared"
test("local logs rotate and redact secret fields, bearer values, and host paths",()=>{const root=mkdtempSync(join(tmpdir(),"mathos-log-")),path=join(root,"mathos.log"),logger=createLogger(path,{maxBytes:256,maxFiles:2});for(let i=0;i<20;i++)logger.error("failed Bearer canary-token",{apiKey:"canary",workspacePath:"C:\\Users\\private\\paper.lean",i});expect(readdirSync(root).length).toBeLessThanOrEqual(3);const text=readdirSync(root).map(file=>readFileSync(join(root,file),"utf8")).join("");expect(text).not.toContain("canary");expect(text).not.toContain("Users\\private")})
