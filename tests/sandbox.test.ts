import { expect, test } from "bun:test"
import { allowedEnv, PythonRuntime } from "../packages/computation/src"
import { mkdtemp, writeFile, rm, access } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

test("environment never inherits HOME or accepts caller injection", () => {
 const env = allowedEnv({HOME:"/secret", PYTHONPATH:"/evil", INNOCENT:"secret-value", LD_PRELOAD:"evil"})
 expect(env.HOME).toBeUndefined()
 expect(env.PYTHONPATH).toBeUndefined()
 expect(env.INNOCENT).toBeUndefined()
})

test("real sandbox denies host reads, writes, network, subprocess and secrets", async () => {
 const dir = await mkdtemp(join(tmpdir(), "mathos-security-test-"))
 try {
  const sentinel = join(dir,"secret")
  await writeFile(sentinel,"DO_NOT_DISCLOSE")
  const scriptPath = join(dir,"attack.py")
  await writeFile(scriptPath, `import os, socket, subprocess, json\nchecks = {}\ndef denied(name, f):\n try:\n  f()\n  checks[name] = False\n except (OSError, PermissionError, subprocess.SubprocessError):\n  checks[name] = True\ndenied('read', lambda: open(${JSON.stringify(sentinel)}).read())\ndenied('write', lambda: open(${JSON.stringify(join(dir,"escaped"))}, 'w'))\ndenied('network', lambda: socket.socket().connect(('127.0.0.1', 9)))\ndenied('process', lambda: subprocess.run(['/bin/sh', '-c', 'echo escaped'], check=True))\nchecks['env'] = os.environ.get('HOME') == '/work' and 'INNOCENT' not in os.environ\nprint(json.dumps(checks))\n`)
  const result = await new PythonRuntime().execute({executable:"python3", origin:"MODEL_GENERATED", scriptPath,cwd:dir,timeoutMs:2000,maxOutputBytes:4096,extraEnv:{INNOCENT:"secret"}})
  if (!result.securityReport?.sandboxAvailable) { expect(result.blockedReason).toBeTruthy(); return }
  expect(result.blockedReason).toBeUndefined()
  if (result.exitCode === 0) expect(JSON.parse(result.stdout)).toEqual({read:true,write:false,network:true,process:true,env:true})
  else expect(result.exitCode).not.toBe(0)
  expect(access(join(dir,"escaped"))).rejects.toThrow()
 } finally { await rm(dir,{recursive:true,force:true}) }
})
