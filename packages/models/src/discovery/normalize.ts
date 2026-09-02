export interface DiscoveredModel{ id:string; displayName:string; capabilities:string[] }
export function normalizeDiscoveredModels(input:unknown):DiscoveredModel[]{
  const rows=Array.isArray(input)?input:(input as any)?.data??(input as any)?.models??[]
  if(!Array.isArray(rows))throw new Error("PROVIDER_DISCOVERY_RESPONSE_INVALID")
  const result=new Map<string,DiscoveredModel>()
  for(const row of rows){const id=typeof row==="string"?row:row?.id??row?.name;if(typeof id!=="string"||!/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,199}$/.test(id))continue;result.set(id,{id,displayName:typeof row?.displayName==="string"?row.displayName:id,capabilities:Array.isArray(row?.capabilities)?row.capabilities.filter((value:unknown)=>typeof value==="string").slice(0,32):[]})}
  return[...result.values()].sort((a,b)=>a.id.localeCompare(b.id))
}
