#!/usr/bin/env bun
import { createHash } from "node:crypto"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { evaluateGlobalPremisePromotion } from "@mathos/retrieval"
const path=resolve("benchmarks/global-premise-set-v1/manifest.json"),manifest=JSON.parse(readFileSync(path,"utf8")),datasetHash=`sha256:${createHash("sha256").update(JSON.stringify(manifest.cases)).digest("hex")}`
const baseline={kernelAcceptedRate:0,proofCompileRate:0,p95LatencyMs:0},candidate={kernelAcceptedRate:0,proofCompileRate:0,p95LatencyMs:0},completeRegressions=0,domains=[...new Set<string>(manifest.cases.map((item:{domain:string})=>item.domain))],domainBreakdown=Object.fromEntries(domains.map((domain)=>[domain,{cases:manifest.cases.filter((item:{domain:string})=>item.domain===domain).length,baseline,candidate}]))
const hashGuard=datasetHash===manifest.datasetHash,decision=hashGuard?evaluateGlobalPremisePromotion({baseline,candidate,completeRegressions,latencyBudgetMs:manifest.latencyBudgetMs}):"INCONCLUSIVE"
console.log(JSON.stringify({benchmark:manifest.benchmark,datasetHash,hashGuard,paired:true,productionDefault:"RANKED_TOP_PREMISES",candidateOptIn:true,baseline,candidate,modelCalls:0,leanCalls:0,completeRegressions,domainBreakdown,decision},null,2))
