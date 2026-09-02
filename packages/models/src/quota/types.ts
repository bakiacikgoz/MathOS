export interface ProviderQuota{state:"available"|"limited"|"exhausted"|"unknown";remaining:number|null;limit:number|null;unit:string|null;resetsAt:string|null;source:"provider"|"unknown"}
