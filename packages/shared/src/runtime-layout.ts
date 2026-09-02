import { posix,win32 } from "node:path"

export interface RuntimeLayout {executablePath:string;installationRoot:string;sharedAssetsRoot:string;userConfigRoot:string;userDataRoot:string;userCacheRoot:string;userLogRoot:string}
export function resolveRuntimeLayout(input:{platform:NodeJS.Platform;home:string;executablePath:string;env:Record<string,string|undefined>;cwd?:string}):RuntimeLayout{
  const path=input.platform==="win32"?win32:posix,installationRoot=path.dirname(path.dirname(input.executablePath))
  if(input.platform==="darwin")return{executablePath:input.executablePath,installationRoot,sharedAssetsRoot:path.join(installationRoot,"share","mathos"),userConfigRoot:path.join(input.home,"Library","Application Support","MathOS","config"),userDataRoot:path.join(input.home,"Library","Application Support","MathOS"),userCacheRoot:path.join(input.home,"Library","Caches","MathOS"),userLogRoot:path.join(input.home,"Library","Logs","MathOS")}
  if(input.platform==="win32"){
    const appData=input.env.APPDATA??path.join(input.home,"AppData","Roaming"),local=input.env.LOCALAPPDATA??path.join(input.home,"AppData","Local")
    return{executablePath:input.executablePath,installationRoot,sharedAssetsRoot:path.join(installationRoot,"share","mathos"),userConfigRoot:path.join(appData,"MathOS","config"),userDataRoot:path.join(appData,"MathOS"),userCacheRoot:path.join(local,"MathOS","cache"),userLogRoot:path.join(local,"MathOS","logs")}
  }
  const config=input.env.XDG_CONFIG_HOME??path.join(input.home,".config"),data=input.env.XDG_DATA_HOME??path.join(input.home,".local","share"),cache=input.env.XDG_CACHE_HOME??path.join(input.home,".cache"),state=input.env.XDG_STATE_HOME??path.join(input.home,".local","state")
  return{executablePath:input.executablePath,installationRoot,sharedAssetsRoot:path.join(installationRoot,"share","mathos"),userConfigRoot:path.join(config,"mathos"),userDataRoot:path.join(data,"mathos"),userCacheRoot:path.join(cache,"mathos"),userLogRoot:path.join(state,"mathos","logs")}
}
