import 'server-only';
import {cookies} from 'next/headers';
import {SESSION_COOKIE} from '@/lib/auth';
import {identityTransaction} from '@/lib/identity-db';
import {tokenHash} from '@/lib/password';
import {LOGIN_HANDOFF_COOKIE} from '@/lib/login-preferences';

export async function clearLoginSession(){
 const jar=await cookies();
 const token=jar.get(SESSION_COOKIE)?.value;
 if(token)await identityTransaction(async c=>{
  const hash=tokenHash(token);
  await c.query("update driver_push_devices p set active=false,last_seen_at=now() from user_sessions s where s.token_hash=$1 and p.user_id=s.user_id",[hash]);
  await c.query('delete from user_sessions where token_hash=$1',[hash]);
  await c.query('delete from account_sessions where token_hash=$1',[hash]);
 });
 jar.delete(SESSION_COOKIE);
 jar.delete(LOGIN_HANDOFF_COOKIE);
}
