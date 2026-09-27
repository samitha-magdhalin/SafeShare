export type WorkspaceRole='owner'|'admin'|'member';
export type Workspace={id:string;name:string;createdBy:string;role:WorkspaceRole};
export type WorkspaceMember={userId:string;displayName:string;email?:string;role:WorkspaceRole};
