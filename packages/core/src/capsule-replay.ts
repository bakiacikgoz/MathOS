export function planCapsuleReplay(input:{manifest:{schemaEpoch:number;toolchains:Array<{name:string;version:string|null}>;models:any[];claims:Array<{id:string;status:string}>};environment:{schemaEpoch:number;toolchains:Record<string,string>;models:boolean};targetEmpty:boolean}) {
  const missing:string[]=[], actions:string[]=[]
  if(input.manifest.schemaEpoch>input.environment.schemaEpoch) missing.push("SCHEMA_TOO_NEW")
  for(const tool of input.manifest.toolchains) if(!input.environment.toolchains[tool.name]) missing.push(`TOOLCHAIN_MISSING:${tool.name}`)
  if(input.manifest.models.length&&!input.environment.models) missing.push("MODEL_UNAVAILABLE")
  for(const claim of input.manifest.claims) if(claim.status==="KERNEL_VERIFIED") actions.push(`LEAN_REVERIFY:${claim.id}`)
  actions.push("EXPERIMENTS_REPLAY_IN_SANDBOX")
  const hard=missing.some(x=>x==="SCHEMA_TOO_NEW"||x.startsWith("TOOLCHAIN_MISSING"))
  const status=hard?"BLOCKED" as const:missing.length||actions.length?"CONDITIONAL" as const:"READY" as const
  const importedClaimStatuses=Object.fromEntries(input.manifest.claims.map(c=>[c.id,c.status==="KERNEL_VERIFIED"?"HISTORICAL_KERNEL_VERIFIED":c.status]))
  return {status,missing,actions,dryRun:true,importedClaimStatuses}
}
export function applyCapsuleReplay(plan:ReturnType<typeof planCapsuleReplay>,input:{targetEmpty:boolean;userAction:boolean;write:()=>void}) {
  if(!input.targetEmpty) throw new Error("REPLAY_TARGET_NOT_EMPTY")
  if(!input.userAction) throw new Error("REPLAY_USER_ACTION_REQUIRED")
  if(plan.status==="BLOCKED") throw new Error("REPLAY_BLOCKED")
  input.write()
  return {applied:true,currentVerificationAuthority:"LOCAL_VERIFICATION_GATE_REQUIRED"}
}
