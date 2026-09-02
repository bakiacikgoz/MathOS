export interface ImpactGraphNode{id:string;entityType:string;entityId:string;revision:number;contentHash:string;status:string|null}
export interface ImpactGraphEdge{from:string;to:string;reasonCode:string}
export interface ImpactGraph{nodes:ImpactGraphNode[];edges:ImpactGraphEdge[]}
export interface ImpactedNode{node:ImpactGraphNode;reasonCodes:string[];path:string[]}
export function downstreamImpact(graph:ImpactGraph,sourceId:string):ImpactedNode[]{
  const nodeById=new Map(graph.nodes.map((node)=>[node.id,node]))
  const queue:Array<{id:string;path:string[];reasons:string[]}>=[{id:sourceId,path:[sourceId],reasons:[]}]
  const seen=new Set([sourceId]),result:ImpactedNode[]=[]
  while(queue.length){const current=queue.shift()!;for(const edge of graph.edges.filter((item)=>item.from===current.id).sort((a,b)=>a.to.localeCompare(b.to)||a.reasonCode.localeCompare(b.reasonCode))){if(seen.has(edge.to))continue;seen.add(edge.to);const node=nodeById.get(edge.to);if(!node)continue;const path=[...current.path,edge.to],reasons=[...current.reasons,edge.reasonCode];result.push({node,reasonCodes:[...new Set(reasons)].sort(),path});queue.push({id:edge.to,path,reasons})}}
  return result.sort((a,b)=>a.node.id.localeCompare(b.node.id))
}
