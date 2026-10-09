import {clearLoginSession} from '@/lib/logout-session';

export const runtime='nodejs';
export async function POST(request:Request){
 if(request.headers.get('origin')!==new URL(request.url).origin)return new Response(null,{status:403});
 await clearLoginSession();
 return Response.json({ok:true},{headers:{'Cache-Control':'private, no-store'}});
}
