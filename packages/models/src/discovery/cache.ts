import{existsSync,mkdirSync,readFileSync,renameSync,writeFileSync}from"node:fs";import{dirname}from"node:path";import type{DiscoveredModel}from"./normalize.ts"
export interface DiscoveryCacheEntry{descriptorId:string;models:DiscoveredModel[];source:"runtime"|"official-static";reviewedAt:string|null;fetchedAt:string;expiresAt:string}
interface Store{schemaVersion:"mathos.provider-discovery-cache.v1";entries:DiscoveryCacheEntry[]}
export class ProviderDiscoveryCache{
 constructor(private readonly path:string,private readonly now:()=>number=Date.now){}
 get(id:string,allowStale=false):DiscoveryCacheEntry|null{const entry=this.load().entries.find(row=>row.descriptorId===id);if(!entry)return null;if(!allowStale&&Date.parse(entry.expiresAt)<=this.now())return null;return structuredClone(entry)}
 set(input:Omit<DiscoveryCacheEntry,"fetchedAt"|"expiresAt">,ttlMs:number):DiscoveryCacheEntry{const fetchedAt=new Date(this.now()).toISOString(),entry={...structuredClone(input),fetchedAt,expiresAt:new Date(this.now()+Math.max(0,ttlMs)).toISOString()};const store=this.load();store.entries=store.entries.filter(row=>row.descriptorId!==input.descriptorId);store.entries.push(entry);mkdirSync(dirname(this.path),{recursive:true});const temporary=`${this.path}.${process.pid}.tmp`;writeFileSync(temporary,`${JSON.stringify(store)}\n`,{encoding:"utf8",mode:0o600});renameSync(temporary,this.path);return structuredClone(entry)}
 private load():Store{if(!existsSync(this.path))return{schemaVersion:"mathos.provider-discovery-cache.v1",entries:[]};const value=JSON.parse(readFileSync(this.path,"utf8"));if(value.schemaVersion!=="mathos.provider-discovery-cache.v1"||!Array.isArray(value.entries))throw new Error("PROVIDER_DISCOVERY_CACHE_INVALID");return value}
}
