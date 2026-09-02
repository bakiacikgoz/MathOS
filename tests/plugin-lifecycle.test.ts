import { afterEach, expect, test } from "bun:test"
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { PersistentPluginRegistry } from "@mathos/plugins"

const roots:string[]=[]
afterEach(()=>{for(const root of roots.splice(0))rmSync(root,{recursive:true,force:true})})
function fixture(version="1.0.0"){const root=mkdtempSync(join(tmpdir(),"mathos-plugin-source-"));roots.push(root);writeFileSync(join(root,"mathos-plugin.json"),JSON.stringify({schemaVersion:"mathos-plugin-v1",id:"example.solver",name:"Example",version,protocol:"json-rpc-2.0-stdio",kind:"SOLVER",executable:"node",args:["main.js"],permissions:{networkHosts:[],readRoots:[],writeRoots:[],executables:["node"],environmentVariables:[],maxRuntimeMs:1000,maxOutputBytes:1000},supportedSchemaVersions:["solver-v1"]}));writeFileSync(join(root,"main.js"),"process.exit(0)");return root}

test("install persists across restart and enable/disable/remove are atomic",()=>{const data=mkdtempSync(join(tmpdir(),"mathos-plugin-data-"));roots.push(data);let registry=new PersistentPluginRegistry(data);const installed=registry.installDirectory(fixture());expect(installed.state).toBe("DISABLED");registry.enable("example.solver","human");registry=new PersistentPluginRegistry(data);expect(registry.info("example.solver").state).toBe("ENABLED");registry.disable("example.solver","human");registry.remove("example.solver");expect(registry.list()).toEqual([])})
test("failed update preserves old version and symlink packages are rejected",()=>{const data=mkdtempSync(join(tmpdir(),"mathos-plugin-data-"));roots.push(data);const registry=new PersistentPluginRegistry(data);registry.installDirectory(fixture());const bad=fixture("2.0.0");if(process.platform==="win32"){writeFileSync(join(bad,"mathos-plugin.json"),"{}" );expect(()=>registry.update("example.solver",bad)).toThrow()}else{symlinkSync(join(bad,"main.js"),join(bad,"escape.js"));expect(()=>registry.update("example.solver",bad)).toThrow("PLUGIN_SYMLINK_REJECTED")}expect(registry.info("example.solver").version).toBe("1.0.0")})
