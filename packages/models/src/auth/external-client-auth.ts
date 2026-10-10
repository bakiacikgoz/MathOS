const SAFE_BASE_ENV = new Set(["PATH","HOME","USERPROFILE","HOMEDRIVE","HOMEPATH","LOCALAPPDATA","APPDATA","XDG_CONFIG_HOME","XDG_CACHE_HOME","XDG_DATA_HOME","TMPDIR","TEMP","TMP","SystemRoot","WINDIR","LANG","LC_ALL"])
export const LOADER_INJECTION_ENV = ["NODE_OPTIONS","NODE_PATH","LD_PRELOAD","LD_AUDIT","DYLD_INSERT_LIBRARIES","BASH_ENV","ZDOTDIR"] as const

/** Windows environment names are case-insensitive (`Path`, not `PATH`, is the usual spelling there). */
export function buildExternalClientEnvironment(source:NodeJS.ProcessEnv=process.env,documentedAuthEnv:string[]=[],platform:NodeJS.Platform=process.platform):Record<string,string>{
  const fold=(key:string)=>platform==="win32"?key.toUpperCase():key
  const allowed=new Set([...SAFE_BASE_ENV,...documentedAuthEnv].map(fold)),blocked=new Set<string>(LOADER_INJECTION_ENV.map(fold)),result:Record<string,string>={},names=new Map<string,string>()
  // A later spelling wins, so `{...env, PATH: extended}` overrides the inherited `Path`.
  for(const [key,value] of Object.entries(source))if(value!==undefined&&allowed.has(fold(key))&&!blocked.has(fold(key))){const previous=names.get(fold(key));if(previous!==undefined)delete result[previous];names.set(fold(key),key);result[key]=value}
  return result
}
