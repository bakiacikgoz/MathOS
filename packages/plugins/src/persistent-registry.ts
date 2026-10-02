import { createHash } from "node:crypto"
import { closeSync, copyFileSync, cpSync, existsSync, fsyncSync, lstatSync, mkdirSync, mkdtempSync, openSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from "node:fs"
import { join, resolve } from "node:path"
import { ArchiveSafetyError, extractTarArchive, inspectTarArchive } from "@mathos/shared/archive"
import { parsePluginManifest } from "./manifest.ts"

export interface InstalledPluginRecord { id:string;version:string;apiVersion:number;installPath:string;checksum:string;enabled:boolean;state:"ENABLED"|"DISABLED"|"QUARANTINED"|"INCOMPATIBLE";capabilities:string[] }
function files(root:string,current=root):string[]{const rows:string[]=[];for(const name of readdirSync(current).sort()){const path=join(current,name),stat=lstatSync(path);if(stat.isSymbolicLink())throw new Error("PLUGIN_SYMLINK_REJECTED");if(stat.isDirectory())rows.push(...files(root,path));else if(stat.isFile())rows.push(path)}return rows}
function checksum(root:string){const hash=createHash("sha256");for(const path of files(root)){hash.update(path.slice(root.length+1).replaceAll("\\","/"));hash.update(readFileSync(path))}return hash.digest("hex")}
function pluginArchiveFailure(error:unknown,fallback:string):Error{
  if(error instanceof ArchiveSafetyError){
    const codes:Record<string,string>={TRAVERSAL:"PLUGIN_ARCHIVE_TRAVERSAL",ENTRY_TYPE_UNSAFE:"PLUGIN_ARCHIVE_ENTRY_TYPE_UNSAFE",DUPLICATE:"PLUGIN_ARCHIVE_DUPLICATE",INVALID:"PLUGIN_ARCHIVE_INVALID"}
    return new Error(codes[error.code]??fallback,{cause:error})
  }
  return new Error(fallback,{cause:error})
}

export class PersistentPluginRegistry {
  private readonly registryPath:string;private rows:InstalledPluginRecord[]
  constructor(private readonly dataRoot:string){mkdirSync(join(dataRoot,"plugins"),{recursive:true});this.registryPath=join(dataRoot,"plugins","registry.json");if(existsSync(this.registryPath)){const value=JSON.parse(readFileSync(this.registryPath,"utf8"));this.rows=Array.isArray(value)?value:value.plugins??[]}else this.rows=[]}
  list(){return this.rows.map(row=>({...row,capabilities:[...row.capabilities]})).sort((a,b)=>a.id.localeCompare(b.id))}
  info(id:string){const row=this.rows.find(item=>item.id===id);if(!row)throw new Error("PLUGIN_NOT_FOUND");return {...row,capabilities:[...row.capabilities]}}
  installDirectory(source:string){return this.activate(source,null)}
  install(source:string){
    const absolute=resolve(source)
    if(lstatSync(absolute).isDirectory())return this.installDirectory(absolute)
    const staging=mkdtempSync(join(this.dataRoot,"plugins",".archive-"))
    const archive=join(staging,"plugin.tar"),extracted=join(staging,"extracted")
    try{
      copyFileSync(absolute,archive)
      try{inspectTarArchive(archive)}catch(error){throw pluginArchiveFailure(error,"PLUGIN_ARCHIVE_INVALID")}
      mkdirSync(extracted)
      try{extractTarArchive(archive,extracted)}catch(error){throw pluginArchiveFailure(error,"PLUGIN_ARCHIVE_EXTRACTION_FAILED")}
      const entries=readdirSync(extracted)
      const root=entries.length===1&&lstatSync(join(extracted,entries[0]!)).isDirectory()?join(extracted,entries[0]!):extracted
      return this.activate(root,null)
    }finally{rmSync(staging,{recursive:true,force:true})}
  }
  update(id:string,source:string){this.info(id);return this.activate(source,id)}
  enable(id:string,actor:string){if(!actor)throw new Error("PLUGIN_APPROVAL_ACTOR_REQUIRED");return this.change(id,{enabled:true,state:"ENABLED"})}disable(id:string,actor:string){if(!actor)throw new Error("PLUGIN_APPROVAL_ACTOR_REQUIRED");return this.change(id,{enabled:false,state:"DISABLED"})}quarantine(id:string){return this.change(id,{enabled:false,state:"QUARANTINED"})}
  remove(id:string){const row=this.info(id);rmSync(row.installPath,{recursive:true,force:true});this.rows=this.rows.filter(item=>item.id!==id);this.save()}
  doctor(){return{schemaVersion:"mathos.plugin-doctor.v1",ready:this.rows.every(row=>existsSync(row.installPath)&&checksum(row.installPath)===row.checksum),plugins:this.list()}}
  private activate(source:string,expectedId:string|null){const absolute=resolve(source);if(!lstatSync(absolute).isDirectory())throw new Error("PLUGIN_DIRECTORY_REQUIRED");files(absolute);const manifestPath=join(absolute,"mathos-plugin.json");if(!existsSync(manifestPath))throw new Error("PLUGIN_MANIFEST_MISSING");const parsed=parsePluginManifest(JSON.parse(readFileSync(manifestPath,"utf8")));if(expectedId&&parsed.manifest.id!==expectedId)throw new Error("PLUGIN_UPDATE_ID_MISMATCH");const root=join(this.dataRoot,"plugins","installed"),target=join(root,parsed.manifest.id),staging=join(this.dataRoot,"plugins",`.staging-${parsed.manifest.id}-${process.pid}`),backup=`${target}.previous-${process.pid}`;mkdirSync(root,{recursive:true});rmSync(staging,{recursive:true,force:true});cpSync(absolute,staging,{recursive:true,errorOnExist:true});const digest=checksum(staging),old=this.rows.find(row=>row.id===parsed.manifest.id);if(old&&!expectedId)throw new Error("PLUGIN_ALREADY_INSTALLED");try{if(existsSync(target))renameSync(target,backup);renameSync(staging,target);const record:InstalledPluginRecord={id:parsed.manifest.id,version:parsed.manifest.version,apiVersion:1,installPath:target,checksum:digest,enabled:false,state:"DISABLED",capabilities:[...parsed.manifest.permissions.networkHosts.map(()=>"network"),...parsed.manifest.permissions.writeRoots.map(()=>"workspace_write"),...parsed.manifest.permissions.executables.map(()=>"external_process")]};this.rows=this.rows.filter(row=>row.id!==record.id).concat(record);this.save();rmSync(backup,{recursive:true,force:true});return this.info(record.id)}catch(error){rmSync(staging,{recursive:true,force:true});if(existsSync(backup)&&!existsSync(target))renameSync(backup,target);throw error}}
  private change(id:string,patch:Partial<InstalledPluginRecord>){const index=this.rows.findIndex(row=>row.id===id);if(index<0)throw new Error("PLUGIN_NOT_FOUND");this.rows[index]={...this.rows[index]!,...patch};this.save();return this.info(id)}
  private save(){const temporary=`${this.registryPath}.${process.pid}.tmp`,body=JSON.stringify({schemaVersion:"mathos.plugin-registry.v1",plugins:this.rows},null,2);writeFileSync(temporary,body,{encoding:"utf8",mode:0o600});const fd=openSync(temporary,"r");try{fsyncSync(fd)}catch(error){if(process.platform!=="win32")throw error}finally{closeSync(fd)};renameSync(temporary,this.registryPath)}
}
