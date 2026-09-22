import {getUser} from '@/lib/auth';
import {normalizeClientErrorReport} from '@/lib/client-error-report';

export async function POST(request:Request){
 const user=await getUser();
 if(!user)return new Response(null,{status:401});
 if(Number(request.headers.get('content-length')??0)>8192)return new Response(null,{status:413});
 let raw:unknown;
 try{raw=await request.json();}catch{return new Response(null,{status:400});}
 const report=normalizeClientErrorReport(raw);
 if(!report)return new Response(null,{status:400});
 console.error('KidLoop client error report',{...report,role:user.role,accountId:user.accountId,userAgent:(request.headers.get('user-agent')??'').slice(0,300)});
 return new Response(null,{status:204});
}
