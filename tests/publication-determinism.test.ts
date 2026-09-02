import { expect, test } from "bun:test"
import { PublicationService } from "../packages/core/src/services/publication-service.ts"
const model:any={title:"P",blocks:[{id:"B",kind:"PROSE",text:"x",accepted:true}],claims:[{id:"C2",status:"DRAFT"},{id:"C1",status:"KERNEL_VERIFIED"}],citations:[{id:"R2",label:"B"},{id:"R1",label:"A"}],references:["R1"],capsuleHash:"h"}
test("publication render is canonical regardless of input ordering",()=>{const service=new PublicationService(),a=service.render(model),b=service.render({...model,claims:[...model.claims].reverse(),citations:[...model.citations].reverse()});expect(a.outputs).toEqual(b.outputs);expect(a.hash).toBe(b.hash)})
