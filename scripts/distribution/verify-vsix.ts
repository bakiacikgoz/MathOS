import { existsSync, readFileSync } from "node:fs"
import { resolve } from "node:path"
import { BRIDGE_PROTOCOL_VERSION } from "@mathos/shared"
const root=resolve(import.meta.dir,"../.."),manifest=JSON.parse(readFileSync(resolve(root,"apps/vscode-extension/package.json"),"utf8")) as {version:string},path=resolve(process.argv[2]??resolve(root,"dist",`mathos-${manifest.version}.vsix`));if(!existsSync(path))throw new Error(`VSIX_MISSING: ${path}`)
const listing=Bun.spawnSync(["tar","-tf",path],{stdout:"pipe",stderr:"pipe"});if(listing.exitCode!==0)throw new Error(`VSIX_UNREADABLE: ${listing.stderr.toString()}`);const files=listing.stdout.toString().split(/\r?\n/).filter(Boolean)
if(!files.includes("extension/package.json")||!files.includes("extension/dist/extension.js"))throw new Error("VSIX_REQUIRED_FILES_MISSING")
if(files.some(file=>/(^|\/)(src|test|tests|node_modules|\.env|coverage)(\/|$)|\.map$|\.log$/i.test(file)))throw new Error("VSIX_DEV_FILE_LEAK")
const packageFile=Bun.spawnSync(["tar","-xOf",path,"extension/package.json"],{stdout:"pipe",stderr:"pipe"}),packaged=JSON.parse(packageFile.stdout.toString()) as {version:string};if(packaged.version!==manifest.version)throw new Error("VSIX_VERSION_MISMATCH")
const extensionFile=Bun.spawnSync(["tar","-xOf",path,"extension/dist/extension.js"],{stdout:"pipe",stderr:"pipe"}).stdout.toString();if(/api[_-]?key\s*[:=]\s*["'][^"']+/i.test(extensionFile))throw new Error("VSIX_SECRET_LEAK");if(!extensionFile.includes(`PROTOCOL_VERSION = ${BRIDGE_PROTOCOL_VERSION}`))throw new Error("VSIX_BRIDGE_PROTOCOL_MISMATCH")
process.stdout.write(`${JSON.stringify({schemaVersion:"mathos.vsix-verification.v1",ready:true,path,version:manifest.version,bridgeProtocolVersion:BRIDGE_PROTOCOL_VERSION,files:files.length},null,2)}\n`)
