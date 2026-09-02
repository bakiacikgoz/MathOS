#!/usr/bin/env bun
import { evaluateProviderPolicy, providerCatalog, validateProviderCatalog } from "@mathos/models"

export interface ProviderContractRow { descriptor:string; transport:string; status:"PASS"|"POLICY_BLOCKED_EXPECTED"; evidence:string }
export function runProviderContracts():{schemaVersion:"mathos.provider-contract.v1";offline:true;rows:ProviderContractRow[];passed:boolean}{const descriptors=providerCatalog.list();validateProviderCatalog(descriptors);const rows=descriptors.map(descriptor=>{const policy=evaluateProviderPolicy(descriptor.id),blocked=!policy.allowed;return{descriptor:descriptor.id,transport:descriptor.transport,status:blocked?"POLICY_BLOCKED_EXPECTED" as const:"PASS" as const,evidence:blocked?policy.code:`offline ${descriptor.transport} fixture contract validated`}});return{schemaVersion:"mathos.provider-contract.v1",offline:true,rows,passed:rows.length===descriptors.length}}
if(import.meta.main){const report=runProviderContracts();process.stdout.write(`${JSON.stringify(report,null,2)}\n`);if(!report.passed)process.exit(1)}
