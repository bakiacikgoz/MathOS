import { mkdirSync, readFileSync } from "node:fs"
import { resolve } from "node:path"
const root=resolve(import.meta.dir,"../.."),extension=resolve(root,"apps/vscode-extension"),manifest=JSON.parse(readFileSync(resolve(extension,"package.json"),"utf8")) as {version:string},output=resolve(root,"dist",`mathos-${manifest.version}.vsix`)
mkdirSync(resolve(root,"dist"),{recursive:true})
const build=Bun.spawnSync([process.execPath,resolve(root,"scripts/build-vscode.ts")],{cwd:root,stdout:"inherit",stderr:"inherit"});if(build.exitCode!==0)process.exit(build.exitCode)
const packaged=Bun.spawnSync([process.execPath,"x","vsce","package","--no-dependencies","--out",output],{cwd:extension,stdout:"inherit",stderr:"inherit"});if(packaged.exitCode!==0)process.exit(packaged.exitCode)
process.stdout.write(`${output}\n`)
