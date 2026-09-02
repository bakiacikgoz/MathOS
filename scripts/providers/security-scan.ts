#!/usr/bin/env bun
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { providerCatalog, redactValue, validateProviderCatalog } from "@mathos/models"

const root=resolve(import.meta.dir,"../.."), listed=Bun.spawnSync(["git","ls-files","packages/models/src","apps/tui/src/ui/Provider*.tsx","apps/vscode-extension/src"],{cwd:root,stdout:"pipe"})
if(listed.exitCode!==0)throw new Error("PROVIDER_SECURITY_SCAN_FILE_LIST_FAILED")
const files=new TextDecoder().decode(listed.stdout).trim().split(/\r?\n/).filter(Boolean), violations:string[]=[]
for(const file of files){const text=readFileSync(resolve(root,file),"utf8");if(/(?:status|epistemicStatus|fidelityStatus)\s*[:=]\s*["'`](?:KERNEL_VERIFIED|HUMAN_APPROVED)["'`]/.test(text))violations.push(`${file}: forbidden trust authority write`);if(/https?:\/\/[^\s"'`]*:[^\s"'`]*@/.test(text))violations.push(`${file}: credential-bearing URL`)}
validateProviderCatalog(providerCatalog.list())
const redacted=JSON.stringify(redactValue({headers:{authorization:"Bearer canary",cookie:"session=canary"},deviceCode:"ABCD",nested:{apiKey:"canary"}} , ["canary"]))
if(redacted.includes("canary")||redacted.includes("ABCD"))violations.push("recursive redaction contract failed")
if(violations.length){process.stderr.write(`${violations.join("\n")}\n`);process.exit(1)}
process.stdout.write(`${JSON.stringify({schemaVersion:"mathos.provider-security-scan.v1",status:"PASS",files:files.length,catalogDescriptors:providerCatalog.list().length,liveVerification:"NOT_CONFIGURED"})}\n`)
