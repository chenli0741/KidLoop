/** Reads after a login redirect may lack a context header; mutations never may. */
export function workspaceRequestAllowed(expected:string|undefined,provided:string|null,mutation:boolean) {
  return !!expected && (provided===expected || (!mutation && provided===null));
}
