import { readFileSync } from "node:fs"
import { join } from "node:path"

export const WORKSPACE_SCHEMA_VERSION=30
export const MINIMUM_WORKSPACE_SCHEMA_VERSION=16
export const BRIDGE_PROTOCOL_VERSION=1
export const PLUGIN_API_VERSION=1
export const CAPSULE_FORMAT_VERSION=1
export const PUBLICATION_FORMAT_VERSION=1

export interface MathOSCompatibilityInput {
  workspaceSchemaVersion:number
  bridgeProtocolVersion:number
  pluginApiVersion:number
  capsuleFormatVersion:number
  publicationFormatVersion:number
}

export class CompatibilityError extends Error {
  constructor(readonly code:string,readonly actual:number,readonly supported:number){super(`${code}: received ${actual}, supported ${supported}`);this.name="CompatibilityError"}
}

export function compatibilityMatrix(){return{
  workspaceSchemaVersion:WORKSPACE_SCHEMA_VERSION,minimumWorkspaceSchemaVersion:MINIMUM_WORKSPACE_SCHEMA_VERSION,
  bridgeProtocolVersion:BRIDGE_PROTOCOL_VERSION,pluginApiVersion:PLUGIN_API_VERSION,
  capsuleFormatVersion:CAPSULE_FORMAT_VERSION,publicationFormatVersion:PUBLICATION_FORMAT_VERSION,
}}

export function assertMathOSCompatibility(input:MathOSCompatibilityInput):{compatible:true}{
  if(input.workspaceSchemaVersion>WORKSPACE_SCHEMA_VERSION)throw new CompatibilityError("WORKSPACE_SCHEMA_TOO_NEW",input.workspaceSchemaVersion,WORKSPACE_SCHEMA_VERSION)
  if(input.workspaceSchemaVersion<MINIMUM_WORKSPACE_SCHEMA_VERSION)throw new CompatibilityError("WORKSPACE_SCHEMA_TOO_OLD",input.workspaceSchemaVersion,MINIMUM_WORKSPACE_SCHEMA_VERSION)
  const exact:Array<[keyof MathOSCompatibilityInput,number,string]>=[
    ["bridgeProtocolVersion",BRIDGE_PROTOCOL_VERSION,"BRIDGE_PROTOCOL_UNSUPPORTED"],
    ["pluginApiVersion",PLUGIN_API_VERSION,"PLUGIN_API_UNSUPPORTED"],
    ["capsuleFormatVersion",CAPSULE_FORMAT_VERSION,"CAPSULE_FORMAT_UNSUPPORTED"],
    ["publicationFormatVersion",PUBLICATION_FORMAT_VERSION,"PUBLICATION_FORMAT_UNSUPPORTED"],
  ]
  for(const[field,supported,code]of exact)if(input[field]!==supported)throw new CompatibilityError(code,input[field],supported)
  return{compatible:true}
}

export function assertProductVersionAlignment(packages:Array<{name:string;version:string}>,canonical:string):void{
  const mismatch=packages.find(pkg=>pkg.version!==canonical)
  if(mismatch)throw new Error(`PRODUCT_VERSION_MISMATCH: ${mismatch.name}=${mismatch.version}; expected ${canonical}`)
}

export function readProductSurfaceVersions(root:string):Array<{name:string;version:string}>{
  const versions = ["package.json","apps/tui/package.json","apps/atlas/package.json","apps/vscode-extension/package.json","apps/desktop/package.json"].map(path=>{
    const value=JSON.parse(readFileSync(join(root,path),"utf8"))as{name:string;version:string};return{name:value.name,version:value.version}
  })
  const config = JSON.parse(readFileSync(join(root, "apps/desktop/src-tauri/tauri.conf.json"), "utf8")) as { productName: string; version: string }
  const cargo = readFileSync(join(root, "apps/desktop/src-tauri/Cargo.toml"), "utf8")
  const packageSection = cargo.split(/^\[package\]\s*$/m)[1]?.split(/^\[/m)[0]
  const version = packageSection?.match(/^version\s*=\s*"([^"]+)"\s*$/m)?.[1]
  if (!version || typeof config.version !== "string") throw new Error("PRODUCT_VERSION_MISSING: desktop Cargo/Tauri configuration")
  return [...versions, { name: `${config.productName} (Tauri)`, version: config.version }, { name: "mathos-desktop (Cargo)", version }]
}
