import type { EntityRevisionChange, StaleMarker } from "@mathos/domain"
import { downstreamImpact,type ImpactGraph } from "@mathos/graph"
import type { StaleMarkerRepository } from "@mathos/storage"
import type { ClockPort } from "../ports/clock-port.ts"
export interface ImpactStalenessDependencies{markers:StaleMarkerRepository;clock:ClockPort;nextId():string}
export class ImpactStalenessService{
  constructor(private readonly d:ImpactStalenessDependencies){}
  apply(change:EntityRevisionChange,graph:ImpactGraph):StaleMarker[]{
    const source=change.after,impacted=downstreamImpact(graph,source.entityId),markers:StaleMarker[]=[]
    for(const impact of impacted){const reasonCode=impact.reasonCodes.join("+")||"SOURCE_CHANGED",existing=this.d.markers.findUnresolved(impact.node.entityType,impact.node.entityId,source.entityType,source.entityId,reasonCode);if(existing){markers.push(existing);continue}const marker:StaleMarker={id:this.d.nextId(),targetType:impact.node.entityType,targetId:impact.node.entityId,sourceType:source.entityType,sourceId:source.entityId,reasonCode,detectedAt:this.d.clock.now(),resolvedAt:null,requiredAction:`REVALIDATE:${source.revision}:${source.contentHash}`,previousStatus:impact.node.status,projectionStatus:"STALE"};this.d.markers.insert(marker);markers.push(marker)}
    return markers
  }
  revalidate(markerId:string,evidence:{sourceId:string;contentHash:string}):StaleMarker{const marker=this.d.markers.get(markerId);if(!marker)throw new Error(`STALE_MARKER_NOT_FOUND: ${markerId}`);const expected=marker.requiredAction.split(":").at(-1);if(marker.sourceId!==evidence.sourceId||expected!==evidence.contentHash)throw new Error("REVALIDATION_EVIDENCE_MISMATCH");return this.d.markers.resolve(markerId,this.d.clock.now())}
}
