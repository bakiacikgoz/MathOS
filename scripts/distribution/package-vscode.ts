import { cpSync,existsSync,mkdirSync } from "node:fs"
import { dirname,join } from "node:path"
export function packageVscodeBridge(root:string,releaseRoot:string):string[]{const source=join(root,"apps","vscode-extension","dist","extension.js"),target=join(releaseRoot,"share","mathos","vscode","extension.js");if(!existsSync(source))throw new Error("VSCODE_BUILD_MISSING");mkdirSync(dirname(target),{recursive:true});cpSync(source,target);return["share/mathos/vscode/extension.js"]}
