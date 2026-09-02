import { expect, test } from "bun:test"
import { PublicationService } from "../packages/core/src/services/publication-service.ts"
test("citation audit reports duplicates unresolved references and missing locators",()=>{const model:any={title:"P",blocks:[],claims:[],citations:[{id:"R",label:"A"},{id:"R",label:"A"}],references:["R","MISSING"],capsuleHash:"h"};expect(new PublicationService().audit(model)).toEqual(expect.arrayContaining(["DUPLICATE_CITATION:R","UNRESOLVED_REFERENCE:MISSING","SOURCE_LOCATOR_MISSING:R"]))})
