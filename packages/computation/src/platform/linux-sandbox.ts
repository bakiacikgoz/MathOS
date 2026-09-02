import { access, copyFile, lstat, mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { basename, join } from "node:path"
import type { SandboxCapability, SandboxedExecutionRequest, SandboxRuntime } from "../sandbox"
import { blockedResult } from "../sandbox"
import { buildBwrapCommand } from "./linux-bwrap"

/** Detects candidate Linux isolation tools without advertising an unimplemented backend. */
export class LinuxSandboxRuntime implements SandboxRuntime {
 constructor(private readonly resolveBackend: () => Promise<string | null> = resolveLinuxSandboxBackend) {}
 async inspect(): Promise<SandboxCapability> {
  const detected = await this.resolveBackend()
  return {
   available: Boolean(detected && basename(detected).includes("bwrap")),
   backend: detected,
   reason: detected && basename(detected).includes("bwrap") ? null : detected ? "EXPERIMENT_BLOCKED_UNREVIEWED_BACKEND" : "EXPERIMENT_BLOCKED_SANDBOX_UNAVAILABLE",
   networkIsolation: Boolean(detected && basename(detected).includes("bwrap")),
  }
 }
 async execute(request: SandboxedExecutionRequest) {
  const capability=await this.inspect(); if(!capability.available||!capability.backend)return blockedResult(request,capability.reason??"EXPERIMENT_BLOCKED_SANDBOX_UNAVAILABLE",capability.backend)
  const source=await lstat(request.scriptPath); if(!source.isFile()||source.isSymbolicLink())return blockedResult(request,"EXPERIMENT_BLOCKED_UNSAFE_SCRIPT",capability.backend)
  const root=await mkdtemp(join(tmpdir(),"mathos-bwrap-")),scriptName=basename(request.scriptPath); await copyFile(request.scriptPath,join(root,scriptName)); const started=Date.now()
  try { const proc=Bun.spawn(buildBwrapCommand({backend:capability.backend,executable:request.executable,scriptName,sandboxRoot:root,timeoutMs:request.timeoutMs,maxOutputBytes:request.maxOutputBytes}),{env:{},stdin:"ignore",stdout:"pipe",stderr:"pipe"}); const timer=setTimeout(()=>proc.kill(),request.timeoutMs); const [exitCode,stdoutRaw,stderrRaw]=await Promise.all([proc.exited,new Response(proc.stdout).text(),new Response(proc.stderr).text()]);clearTimeout(timer); const stdout=stdoutRaw.slice(0,request.maxOutputBytes),stderr=stderrRaw.slice(0,request.maxOutputBytes);return{exitCode,timedOut:Date.now()-started>=request.timeoutMs,stdout,stderr,stdoutTruncated:stdoutRaw.length>stdout.length,stderrTruncated:stderrRaw.length>stderr.length,durationMs:Date.now()-started,pid:proc.pid,securityReport:{sandboxAvailable:true,sandboxBackend:capability.backend,networkAllowed:false,filesystemMode:"PRIVATE_TEMP_ONLY",timeoutMs:request.timeoutMs,outputLimitBytes:request.maxOutputBytes,blockedReason:null,executionPolicyVersion:"sandbox-v1"}} } finally {await rm(root,{recursive:true,force:true})}
 }
}

export async function resolveLinuxSandboxBackend(which: (name: string) => string | null = (name) => Bun.which(name) ?? null): Promise<string | null> {
 for (const name of ["bwrap"]) {
  const found = which(name)
  if (found) return found
 }
 for (const path of ["/usr/bin/bwrap"]) {
  try { await access(path); return path } catch {}
 }
 return null
}
