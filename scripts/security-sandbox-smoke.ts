import { PythonRuntime } from "../packages/computation/src"
import { mkdtemp, writeFile } from "node:fs/promises"
import { join } from "node:path"
const root=await mkdtemp("/private/tmp/mathos-security-smoke-")
const script=join(root,"attack.py")
await writeFile(script,"open('/etc/hosts').read()\n")
const result=await new PythonRuntime().execute({executable:"python3",scriptPath:script,cwd:root,timeoutMs:1500,maxOutputBytes:4096,origin:"MODEL_GENERATED"})
if (process.platform === "darwin" && result.exitCode === 0) throw new Error("sandbox filesystem escape succeeded")
if (process.platform !== "darwin" && !result.blockedReason) throw new Error("unsupported platform did not fail closed")
console.log(JSON.stringify({passed:true,backend:result.securityReport?.sandboxBackend,blockedReason:result.blockedReason??null}))
