import { expect, test } from "bun:test"
import { allowedEnv, PythonRuntime } from "../packages/computation/src"
import { mkdtemp, writeFile, readFile, rm, access } from "node:fs/promises"
import { randomUUID } from "node:crypto"
import { tmpdir } from "node:os"
import { basename, join, resolve, sep } from "node:path"

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
  const hostCanary = join(dir,"host-canary")
  const outsideWork = `/work/../escaped-${randomUUID()}`
  const scriptPath = join(dir,"attack.py")
  await writeFile(scriptPath, `import os, socket, subprocess, json
checks = {}
def denied(name, f):
 try:
  f()
  checks[name] = False
 except (OSError, PermissionError, subprocess.SubprocessError):
  checks[name] = True
denied('read', lambda: open('/work/secret').read())
denied('write', lambda: open(${JSON.stringify(outsideWork)}, 'w').write('ESCAPED'))
denied('network', lambda: socket.socket().connect(('127.0.0.1', 9)))
denied('process', lambda: subprocess.run(['/bin/sh', '-c', 'echo escaped'], check=True))
try:
 open(${JSON.stringify(hostCanary)}, 'w').write('ESCAPED')
except OSError:
 pass
try:
 open('/work/private-write', 'w').write('PRIVATE')
 checks['privateWrite'] = open('/work/private-write').read() == 'PRIVATE'
except OSError:
 checks['privateWrite'] = False
checks['env'] = os.environ.get('HOME') == '/work' and 'INNOCENT' not in os.environ
print(json.dumps(checks))
`)
  const result = await new PythonRuntime().execute({executable:"python3", origin:"MODEL_GENERATED", scriptPath,cwd:dir,timeoutMs:2000,maxOutputBytes:4096,extraEnv:{INNOCENT:"secret"}})
  if (!result.securityReport?.sandboxAvailable) { expect(result.blockedReason).toBeTruthy(); return }
  expect(result.blockedReason).toBeUndefined()
  expect(result.exitCode).toBe(0)
  expect(JSON.parse(result.stdout)).toEqual({read:true,write:true,network:true,process:true,privateWrite:true,env:true})
  expect(result.stdout).not.toContain("DO_NOT_DISCLOSE")
  expect(await readFile(sentinel,"utf8")).toBe("DO_NOT_DISCLOSE")
  await expect(access(hostCanary)).rejects.toThrow()
  await expect(access(join(dir,"private-write"))).rejects.toThrow()
 } finally {
  const target = resolve(dir), tempRoot = resolve(tmpdir())
  if (!target.startsWith(`${tempRoot}${sep}`) || !basename(target).startsWith("mathos-security-test-")) throw new Error(`Unsafe sandbox test cleanup: ${target}`)
  await rm(target,{recursive:true,force:true})
 }
})
