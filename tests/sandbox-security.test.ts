import { afterEach, expect, test as bunTest } from "bun:test"
import { mkdtemp, readFile, rm, writeFile, access } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { PythonRuntime, type SandboxRuntime, type SandboxedExecutionRequest } from "@mathos/computation"
const test = bunTest
const dirs:string[]=[]
afterEach(async()=>{for(const d of dirs.splice(0)) await rm(d,{recursive:true,force:true})})
async function run(code:string, options:Partial<SandboxedExecutionRequest>={}) {
 const d=await mkdtemp(join(tmpdir(),"mathos-sec-"));dirs.push(d);const scriptPath=join(d,"main.py");await writeFile(scriptPath,code)
 return new PythonRuntime().execute({executable:"python3",origin:"MODEL_GENERATED",scriptPath,cwd:d,timeoutMs:10_000,maxOutputBytes:4096,...options})
}
const unavailable:SandboxRuntime={async inspect(){return {available:false,backend:null,reason:"EXPERIMENT_BLOCKED_SANDBOX_UNAVAILABLE",networkIsolation:false}},async execute(req){return {...await new PythonRuntime("python3",unavailable).execute(req)}}}
test("model code cannot read a host secret",async()=>{const secret=join(await mkdtemp(join(tmpdir(),"mathos-host-")),"secret");dirs.push(secret.slice(0,-7));await writeFile(secret,"HOST_SECRET");const r=await run(`print(open(${JSON.stringify(secret)}).read())`);expect(r.stdout).not.toContain("HOST_SECRET");expect(r.exitCode).not.toBe(0)})
test("model code receives only a private HOME and no API secrets",async()=>{const r=await run("import os, json; print(json.dumps(dict(os.environ)))",{extraEnv:{HOME:"/private",OPENAI_API_KEY:"SECRET",INNOCENT:"SECRET"}});expect(r.stdout).not.toContain("SECRET");if(!r.blockedReason)expect(JSON.parse(r.stdout).HOME).toBe("/work")})
test("model code cannot connect to a network socket",async()=>{const r=await run("import socket; socket.socket().connect(('127.0.0.1',9))");expect(r.exitCode).not.toBe(0)})
test("model code cannot spawn another executable",async()=>{const r=await run("import subprocess; subprocess.run(['/bin/sh','-c','echo BAD'])");expect(r.stdout).not.toContain("BAD");expect(r.exitCode).not.toBe(0)})
test("timeout kills the process group",async()=>{const r=await run("while True: pass",{timeoutMs:100});if(r.blockedReason)expect(r.blockedReason).toContain("SANDBOX_UNAVAILABLE");else{expect(r.timedOut).toBe(true);expect(r.exitCode).toBeNull()}})
test("output is bounded in bytes and marked truncated",async()=>{const r=await run("print('x'*100000)",{maxOutputBytes:1024});expect(Buffer.byteLength(r.stdout)).toBeLessThanOrEqual(1024);if(r.blockedReason)expect(r.blockedReason).toContain("SANDBOX_UNAVAILABLE");else expect(r.stdoutTruncated).toBe(true)})
test("model code cannot escape its private cwd",async()=>{const outside=join(tmpdir(),`mathos-escaped-${Date.now()}`);await run(`open(${JSON.stringify(outside)},'w').write('BAD')`);await expect(access(outside)).rejects.toThrow()})
test("unavailable sandbox blocks instead of running",async()=>{const d=await mkdtemp(join(tmpdir(),"mathos-sec-"));dirs.push(d);const p=join(d,"main.py");await writeFile(p,"print('BAD')");const sandbox:SandboxRuntime={async inspect(){return {available:false,backend:null,reason:"EXPERIMENT_BLOCKED_SANDBOX_UNAVAILABLE",networkIsolation:false}},async execute(req){return {exitCode:null,timedOut:false,stdout:"",stderr:"",stdoutTruncated:false,stderrTruncated:false,durationMs:0,pid:null,blockedReason:"EXPERIMENT_BLOCKED_SANDBOX_UNAVAILABLE"}}};const r=await new PythonRuntime("python3",sandbox).execute({executable:"python3",origin:"MODEL_GENERATED",scriptPath:p,cwd:d,timeoutMs:100,maxOutputBytes:100});expect(r.blockedReason).toBe("EXPERIMENT_BLOCKED_SANDBOX_UNAVAILABLE");expect(r.stdout).not.toContain("BAD")})
test("trusted builtin still uses the sandbox or fails closed",async()=>{const r=await run("print('OK')",{origin:"TRUSTED_BUILTIN"});if(r.securityReport?.sandboxAvailable)expect(r.stdout.trim()).toBe("OK");else expect(r.blockedReason).toContain("SANDBOX_UNAVAILABLE")})
test("model code cannot fork",async()=>{const r=await run("import os; os.fork(); print('BAD')");expect(r.stdout).not.toContain("BAD");expect(r.exitCode).not.toBe(0)})
test("output limit is aggregate across stdout and stderr",async()=>{const r=await run("import sys; sys.stdout.write('o'*800);sys.stdout.flush();sys.stderr.write('e'*800)",{maxOutputBytes:1024});expect(Buffer.byteLength(r.stdout)+Buffer.byteLength(r.stderr)).toBeLessThanOrEqual(1024);if(r.blockedReason)expect(r.blockedReason).toContain("SANDBOX_UNAVAILABLE");else expect(r.stdoutTruncated||r.stderrTruncated).toBe(true)})
test("model code cannot inspect host SSH metadata",async()=>{const ssh=join(process.env.HOME ?? "/nonexistent",".ssh");const r=await run(`import os; print(os.stat(${JSON.stringify(ssh)}))`);expect(r.stdout).not.toContain("st_mode");expect(r.exitCode).not.toBe(0)})
