import type{ProviderDescriptor}from"../catalog/types.ts";import type{DiscoveredModel}from"./normalize.ts"
export interface StaticModelFallback{source:"official-static";reviewedAt:string;models:DiscoveredModel[]}
export function officialStaticFallback(descriptor:ProviderDescriptor):StaticModelFallback|null{return descriptor.defaultModels.length?{source:"official-static",reviewedAt:descriptor.terms.lastReviewedAt,models:descriptor.defaultModels.map(id=>({id,displayName:id,capabilities:[]}))}:null}
