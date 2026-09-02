#!/usr/bin/env bun
import { runProviderContracts } from "./contract-test.ts"
import { runProviderLiveSmoke } from "./live-smoke.ts"
export async function runProviderQualification(argv:string[]){const contract=runProviderContracts(),profileIndex=argv.indexOf("--profile"),profile=profileIndex>=0?argv[profileIndex+1]:undefined,live=profile?await runProviderLiveSmoke([profile,...argv.filter(value=>value!=="--json"&&value!=="--profile"&&value!==profile)]):null;return{schemaVersion:"mathos.provider-qualification.v1",platform:`${process.platform}-${process.arch}`,contract,live:live??{status:"NOT_CONFIGURED"},qualified:contract.passed&&Boolean(live?.liveRequest==="PASS")}}
if(import.meta.main){runProviderQualification(process.argv.slice(2)).then(report=>{process.stdout.write(`${JSON.stringify(report,null,2)}\n`);if(!report.contract.passed)process.exit(1)})}
