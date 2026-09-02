const SAFE_BASE_ENV = new Set(["PATH","HOME","USERPROFILE","HOMEDRIVE","HOMEPATH","LOCALAPPDATA","APPDATA","XDG_CONFIG_HOME","XDG_CACHE_HOME","XDG_DATA_HOME","TMPDIR","TEMP","TMP","SystemRoot","WINDIR","LANG","LC_ALL"])
export const LOADER_INJECTION_ENV = ["NODE_OPTIONS","NODE_PATH","LD_PRELOAD","LD_AUDIT","DYLD_INSERT_LIBRARIES","BASH_ENV","ZDOTDIR"] as const

export function buildExternalClientEnvironment(source:NodeJS.ProcessEnv=process.env,documentedAuthEnv:string[]=[]):Record<string,string>{
  const allowed=new Set([...SAFE_BASE_ENV,...documentedAuthEnv]),blocked=new Set<string>(LOADER_INJECTION_ENV),result:Record<string,string>={}
  for(const [key,value] of Object.entries(source))if(value!==undefined&&allowed.has(key)&&!blocked.has(key))result[key]=value
  return result
}
