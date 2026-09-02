import { cpSync,existsSync,mkdirSync } from "node:fs"
import { dirname,join } from "node:path"
export function packageAtlas(root:string,releaseRoot:string):string[]{const source=join(root,"apps","atlas","dist"),target=join(releaseRoot,"share","mathos","atlas");if(!existsSync(source))throw new Error("ATLAS_BUILD_MISSING");mkdirSync(dirname(target),{recursive:true});cpSync(source,target,{recursive:true});return[...new Bun.Glob("**/*").scanSync({cwd:target,onlyFiles:true})].map(path=>`share/mathos/atlas/${path.replaceAll("\\","/")}`).sort()}
