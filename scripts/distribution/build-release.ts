#!/usr/bin/env bun
import { mkdirSync,readFileSync,readdirSync,rmSync,writeFileSync } from "node:fs"
import { dirname,join,resolve } from "node:path"
import { MATHOS_PRODUCT_VERSION,assertProductVersionAlignment,createReleaseManifest,currentBuildIdentity,readProductSurfaceVersions } from "@mathos/shared"
import { packageAtlas } from "./package-atlas.ts"
import { packageVscodeBridge } from "./package-vscode.ts"

const ROOT=resolve(import.meta.dir,"..","..")
const targetNames:Record<string,string>={"darwin-arm64":"bun-darwin-arm64","darwin-x64":"bun-darwin-x64","linux-x64":"bun-linux-x64","linux-arm64":"bun-linux-arm64","windows-x64":"bun-windows-x64"}
export function hostReleaseTarget():string{return process.platform==="darwin"?`darwin-${process.arch}`:process.platform==="linux"?`linux-${process.arch}`:`windows-${process.arch}`}
function dependencyInventory(root:string){const rows:Array<{name:string;version:string;license:string}>=[];for(const parent of ["apps","packages"]){for(const dir of readdirSync(join(root,parent),{withFileTypes:true}).filter(row=>row.isDirectory())){const pkg=JSON.parse(readFileSync(join(root,parent,dir.name,"package.json"),"utf8"))as{name:string;version:string;license?:string};rows.push({name:pkg.name,version:pkg.version,license:pkg.license??"MIT (workspace)"})}}const rootPkg=JSON.parse(readFileSync(join(root,"package.json"),"utf8"))as{name:string;version:string;license:string};rows.push({name:rootPkg.name,version:rootPkg.version,license:rootPkg.license});return rows.sort((a,b)=>a.name.localeCompare(b.name))}
async function runBuildScript(script:string){const proc=Bun.spawn([process.execPath,"run",script],{cwd:ROOT,stdout:"inherit",stderr:"inherit",stdin:"ignore"});if(await proc.exited!==0)throw new Error(`RELEASE_BUILD_STEP_FAILED:${script}`)}
export async function buildRelease(target=hostReleaseTarget(),outputRoot=join(ROOT,"artifacts","releases")){
  const bunTarget=targetNames[target];if(!bunTarget)throw new Error(`RELEASE_TARGET_UNSUPPORTED:${target}`)
  assertProductVersionAlignment(readProductSurfaceVersions(ROOT));await runBuildScript("build:atlas");await runBuildScript("build:vscode")
  const identity=currentBuildIdentity(),releaseRoot=join(outputRoot,MATHOS_PRODUCT_VERSION,target,"root");rmSync(releaseRoot,{recursive:true,force:true});mkdirSync(join(releaseRoot,"bin"),{recursive:true})
  const executableName=target.startsWith("windows-")?"mathos.exe":"mathos",executable=join(releaseRoot,"bin",executableName)
  const result=await Bun.build({entrypoints:[join(ROOT,"apps","tui","src","cli.ts")],compile:{target:bunTarget as any,outfile:executable},minify:true,define:{"process.env.MATHOS_BUILD_REVISION":JSON.stringify(identity.gitRevision),"process.env.MATHOS_BUILD_ID":JSON.stringify(identity.buildId)}})
  if(!result.success)throw new Error(`STANDALONE_BUILD_FAILED:${result.logs.map(String).join(";")}`)
  const paths=[`bin/${executableName}`,...packageAtlas(ROOT,releaseRoot),...packageVscodeBridge(ROOT,releaseRoot)]
  const inventory=dependencyInventory(ROOT);writeFileSync(join(releaseRoot,"SBOM.json"),JSON.stringify({spdxVersion:"SPDX-2.3",name:`mathos-${MATHOS_PRODUCT_VERSION}`,packages:inventory},null,2)+"\n");writeFileSync(join(releaseRoot,"THIRD_PARTY_LICENSES.json"),JSON.stringify(inventory,null,2)+"\n");paths.push("SBOM.json","THIRD_PARTY_LICENSES.json")
  const manifest=createReleaseManifest({root:releaseRoot,target,productVersion:MATHOS_PRODUCT_VERSION,gitRevision:identity.gitRevision,buildId:identity.buildId,paths});writeFileSync(join(releaseRoot,"RELEASE-MANIFEST.json"),JSON.stringify(manifest,null,2)+"\n");writeFileSync(join(releaseRoot,"SHA256SUMS"),manifest.files.map(file=>`${file.sha256}  ${file.path}`).join("\n")+"\n")
  const archiveName=`mathos-${MATHOS_PRODUCT_VERSION}-${target}.tar.gz`,archivePath=join(dirname(releaseRoot),archiveName),tar=Bun.spawnSync(["tar","-czf",archivePath,"-C",dirname(releaseRoot),"root"],{stdout:"pipe",stderr:"pipe"});if(tar.exitCode!==0)throw new Error(`RELEASE_ARCHIVE_FAILED:${new TextDecoder().decode(tar.stderr)}`)
  return{releaseRoot,executable,manifest,archiveName,archivePath}
}
if(import.meta.main){const target=process.argv.find(arg=>arg.startsWith("--target="))?.slice(9)??hostReleaseTarget();const result=await buildRelease(target);console.log(JSON.stringify({releaseRoot:result.releaseRoot,archiveName:result.archiveName,files:result.manifest.files.length},null,2))}
