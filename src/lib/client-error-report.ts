export type ClientErrorReport={reference:string;message:string;stack:string;path:string};

function clipped(value:unknown,max:number){return typeof value==='string'?value.slice(0,max):'';}

export function normalizeClientErrorReport(value:unknown):ClientErrorReport|null{
 if(!value||typeof value!=='object')return null;
 const source=value as Record<string,unknown>;
 const reference=clipped(source.reference,128);
 if(!/^(?:UI-[A-Z0-9]{8}|[A-Za-z0-9_-]{1,128})$/.test(reference))return null;
 const path=clipped(source.path,300);
 if(!path.startsWith('/')||path.startsWith('//'))return null;
 return {reference,message:clipped(source.message,500),stack:clipped(source.stack,4000),path};
}
