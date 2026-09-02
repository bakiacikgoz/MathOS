import { createHash } from "node:crypto"
import { lstatSync,readFileSync } from "node:fs"
import { isAbsolute,posix,resolve,win32 } from "node:path"
import { BRIDGE_PROTOCOL_VERSION,PLUGIN_API_VERSION } from "./compatibility.ts"

export interface ReleaseManifestV1 {schemaVersion:"mathos-release-manifest-v1";productVersion:string;gitRevision:string;buildId:string;target:string;bridgeProtocolVersion:number;pluginApiVersion:number;files:Array<{path:string;sha256:string;size:number}>}
const sha256=(bytes:Uint8Array)=>createHash("sha256").update(bytes).digest("hex")
function safePath(path:string):string{const value=path.replaceAll("\\","/");if(!value||isAbsolute(path)||win32.isAbsolute(path)||value.startsWith("/")||value.split("/").includes("..")||posix.normalize(value)!==value)throw new Error("RELEASE_PATH_UNSAFE");return value}
export function createReleaseManifest(input:{root:string;target:string;productVersion:string;gitRevision:string;buildId:string;paths:string[]}):ReleaseManifestV1{
  const files=[...new Set(input.paths.map(safePath))].sort().map(path=>{const absolute=resolve(input.root,path),stat=lstatSync(absolute);if(!stat.isFile()||stat.isSymbolicLink())throw new Error("RELEASE_FILE_UNSAFE");const bytes=readFileSync(absolute);return{path,sha256:sha256(bytes),size:bytes.byteLength}})
  return{schemaVersion:"mathos-release-manifest-v1",productVersion:input.productVersion,gitRevision:input.gitRevision,buildId:input.buildId,target:input.target,bridgeProtocolVersion:BRIDGE_PROTOCOL_VERSION,pluginApiVersion:PLUGIN_API_VERSION,files}
}
export function verifyReleaseManifest(root:string,manifest:ReleaseManifestV1):{ok:boolean;errors:string[]}{
  const errors:string[]=[]
  for(const file of manifest.files){const path=safePath(file.path);try{const absolute=resolve(root,path),stat=lstatSync(absolute);if(!stat.isFile()||stat.isSymbolicLink()){errors.push(`RELEASE_FILE_UNSAFE:${path}`);continue}const bytes=readFileSync(absolute);if(bytes.byteLength!==file.size)errors.push(`RELEASE_FILE_SIZE_MISMATCH:${path}`);if(sha256(bytes)!==file.sha256)errors.push(`RELEASE_FILE_HASH_MISMATCH:${path}`)}catch{errors.push(`RELEASE_FILE_MISSING:${path}`)}}
  return{ok:errors.length===0,errors}
}
