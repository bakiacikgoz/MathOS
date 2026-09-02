import { describe,expect,test } from "bun:test"
import { mkdtempSync,mkdirSync,readFileSync,writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { createReleaseManifest,verifyReleaseManifest } from "@mathos/shared"

describe("release manifest",()=>{
  test("canonicalizes files and verifies size and SHA-256",()=>{
    const root=mkdtempSync(join(tmpdir(),"mathos-release-manifest-"));mkdirSync(join(root,"bin"));mkdirSync(join(root,"share"));writeFileSync(join(root,"bin","mathos"),"binary");writeFileSync(join(root,"share","atlas.js"),"atlas")
    const manifest=createReleaseManifest({root,target:"linux-x64",productVersion:"1.0.0-rc.1",gitRevision:"0123456789abcdef0123456789abcdef01234567",buildId:"b1",paths:["share/atlas.js","bin/mathos"]})
    expect(manifest.files.map(file=>file.path)).toEqual(["bin/mathos","share/atlas.js"])
    expect(manifest.files[0]?.sha256).toMatch(/^[a-f0-9]{64}$/)
    expect(verifyReleaseManifest(root,manifest)).toEqual({ok:true,errors:[]})
    writeFileSync(join(root,"bin","mathos"),"tampered")
    expect(verifyReleaseManifest(root,manifest).errors).toEqual(["RELEASE_FILE_SIZE_MISMATCH:bin/mathos","RELEASE_FILE_HASH_MISMATCH:bin/mathos"])
    expect(readFileSync(join(root,"share","atlas.js"),"utf8")).toBe("atlas")
  })
  test("rejects traversal before reading files",()=>{
    const root=mkdtempSync(join(tmpdir(),"mathos-release-traversal-"))
    expect(()=>createReleaseManifest({root,target:"linux-x64",productVersion:"x",gitRevision:"UNKNOWN",buildId:"b",paths:["../secret"]})).toThrow("RELEASE_PATH_UNSAFE")
  })
})
