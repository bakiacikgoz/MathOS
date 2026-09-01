/** Deliberately ignores all caller variables; a blacklist cannot sanitize secrets. */
export function allowedEnv(_extra: Record<string,string> = {}): Record<string,string> {
 return {PATH:"/usr/bin:/bin",LANG:"C",LC_ALL:"C",PYTHONDONTWRITEBYTECODE:"1",PYTHONUNBUFFERED:"1",MATHOS_EXPERIMENT_NETWORK:"false"}
}
