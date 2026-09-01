import { access, mkdtemp, readFile, realpath, rm, writeFile, stat } from "node:fs/promises"
import { join } from "node:path"
import { spawn } from "node:child_process"
import { allowedEnv } from "../environment"
import { evaluateExperimentPolicy } from "../policy"
import { blockedResult, type SandboxRuntime, type SandboxedExecutionRequest } from "../sandbox"

const BACKEND = "macos-sandbox-exec"
// Only OS-installed Python is supported. Never widen reads to HOME or a project virtualenv.
const PYTHONS = ["/Library/Developer/CommandLineTools/usr/bin/python3", "/usr/bin/python3"]
async function pythonPath(requested:string) {
 if (requested !== "python3" && !PYTHONS.includes(requested)) throw new Error("unsupported executable")
 for (const path of requested === "python3" ? PYTHONS : [requested]) { try {await access(path);const resolved = await realpath(path); const app = resolved.replace(/\/bin\/python[^/]+$/, "/Resources/Python.app/Contents/MacOS/Python"); await access(app); return app} catch {} }
 throw new Error("python unavailable")
}
function profile(root:string, python:string) {
 return `(version 1)
(deny default)
(import "system.sb")
(allow process-exec (literal ${JSON.stringify(python)}))
(allow sysctl-read)
(allow process-info*)
(allow mach-lookup (global-name "com.apple.system.logger"))
(allow file-read* (subpath "/System/Library") (subpath "/usr/lib") (subpath "/Library/Developer/CommandLineTools/Library/Frameworks/Python3.framework") (literal ${JSON.stringify(python)}) (literal "/dev/null") (literal "/dev/urandom") (literal "/dev/random"))
(allow file-read* file-write* (subpath ${JSON.stringify(root)}))
(allow file-write* (literal "/dev/null"))`
}
export class MacOSSandboxRuntime implements SandboxRuntime {
 async inspect() {
  try {await access("/usr/bin/sandbox-exec");await pythonPath("python3");return {available:true,backend:BACKEND,reason:null,networkIsolation:true}}
  catch {return {available:false,backend:BACKEND,reason:"EXPERIMENT_BLOCKED_SANDBOX_UNAVAILABLE",networkIsolation:false}}
 }
 async execute(request:SandboxedExecutionRequest) {
  if (!(await this.inspect()).available) return blockedResult(request,"EXPERIMENT_BLOCKED_SANDBOX_UNAVAILABLE",BACKEND)
  let root:string|undefined
  try {
   const info = await stat(request.scriptPath)
   if (!info.isFile() || info.size > 65536) return blockedResult(request,"EXPERIMENT_BLOCKED_POLICY",BACKEND)
   const code = await readFile(request.scriptPath)
   const policy = evaluateExperimentPolicy({...request,codeBytes:code.byteLength})
   if (!policy.allowed) return blockedResult(request,policy.blockedReason!,BACKEND)
   const python = await pythonPath(request.executable)
   root = await realpath(await mkdtemp("/private/tmp/mathos-sandbox-"))
   await writeFile(join(root,"experiment.py"),code,{mode:0o600})
   // Hard limits cannot be raised by user code. Fork is separately denied by Seatbelt.
   const launcher = `import runpy\nrunpy.run_path('experiment.py', run_name='__main__')\n`
   await writeFile(join(root,"launch.py"),launcher,{mode:0o600})
   await writeFile(join(root,"profile.sb"),profile(root,python),{mode:0o600})
   const cpuSeconds = Math.max(1,Math.ceil(request.timeoutMs/1000))
   const resourceLauncher = `ulimit -t ${cpuSeconds}
ulimit -f 16384
ulimit -n 64
ulimit -u 1
exec /usr/bin/sandbox-exec -f profile.sb ${python} -I -B -u launch.py
`
   await writeFile(join(root,"sandbox-launch.sh"),resourceLauncher,{mode:0o700})
   const started = Date.now()
   const child = spawn("/bin/sh",[join(root,"sandbox-launch.sh")],{cwd:root,env:{...allowedEnv(),TMPDIR:root},detached:true,stdio:["ignore","pipe","pipe"]})
   let timedOut=false, stdoutTruncated=false, stderrTruncated=false
   let out=Buffer.alloc(0),err=Buffer.alloc(0)
   const kill = () => {if (child.pid) {try {process.kill(-child.pid,"SIGKILL")} catch {child.kill("SIGKILL")}}}
   const retain = (stream:"stdout"|"stderr", chunk:Buffer) => {
    const keep=Math.max(0,request.maxOutputBytes-out.length-err.length)
    if(stream === "stdout") out=Buffer.concat([out,chunk.subarray(0,keep)])
    else err=Buffer.concat([err,chunk.subarray(0,keep)])
    if(chunk.length>keep) {if(stream === "stdout") stdoutTruncated=true; else stderrTruncated=true;kill()}
   }
   child.stdout.on("data",(chunk:Buffer) => retain("stdout",chunk))
   child.stderr.on("data",(chunk:Buffer) => retain("stderr",chunk))
   const timer=setTimeout(()=>{timedOut=true;kill()},request.timeoutMs)
   let exitCode:number|null
   try {exitCode=await new Promise<number|null>((resolve,reject)=>{child.once("error",reject);child.once("close",resolve)})} finally {clearTimeout(timer);kill()}
   // Decode without replacement characters so the returned UTF-8 byte count stays bounded.
   const decode=(b:Buffer)=>new TextDecoder("utf-8",{fatal:false}).decode(b).replace(/\uFFFD$/u,"")
   return {exitCode:timedOut?null:exitCode,timedOut,stdout:decode(out),stderr:decode(err),stdoutTruncated,stderrTruncated,durationMs:Date.now()-started,pid:child.pid??null,securityReport:{sandboxAvailable:true,sandboxBackend:BACKEND,networkAllowed:false,filesystemMode:"PRIVATE_TEMP_ONLY",timeoutMs:request.timeoutMs,outputLimitBytes:request.maxOutputBytes,blockedReason:null,executionPolicyVersion:policy.version}}
  } catch {return blockedResult(request,"EXPERIMENT_BLOCKED_SANDBOX_UNAVAILABLE",BACKEND)}
  finally {if(root) await rm(root,{recursive:true,force:true})}
 }
}
