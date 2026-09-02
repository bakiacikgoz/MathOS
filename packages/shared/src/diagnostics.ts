import { createHash } from "node:crypto"
import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"
const categories=["workspace","storage","lean","models","literature","computation","plugins","distribution"] as const
const safe=(value:Record<string,unknown>)=>Object.fromEntries(Object.entries(value).filter(([key])=>/^(version|platform|arch|schema|doctor|build|capabilities)$/i.test(key)))
export function createSupportBundle(root:string,metadata:Record<string,unknown>){mkdirSync(root,{recursive:true});const payload={schemaVersion:"mathos.support-bundle.v1",telemetry:"DISABLED",metadata:safe(metadata)},canonical=JSON.stringify(payload),envelope={...payload,sha256:createHash("sha256").update(canonical).digest("hex")},path=join(root,"mathos-support-bundle.json");writeFileSync(path,JSON.stringify(envelope,null,2));return path}
export function verifySupportBundle(path:string){const value=JSON.parse(readFileSync(path,"utf8")),{sha256,...payload}=value,actual=createHash("sha256").update(JSON.stringify(payload)).digest("hex");return{ok:sha256===actual,schemaVersion:value.schemaVersion}}
export function normalizeDoctorContract(checks:Array<{name:string;status:string;detail:string}>){return{schemaVersion:"mathos.doctor.v1",categories:[...categories],ready:checks.every(item=>item.status==="PASS"),checks:checks.map(item=>({category:item.name.toLowerCase(),state:item.status==="PASS"?"READY":"BLOCKED",detail:item.detail}))}}
