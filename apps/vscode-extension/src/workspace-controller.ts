export class WorkspaceController{constructor(readonly root:string,readonly trusted:boolean){}canMutate(){return this.trusted}}
