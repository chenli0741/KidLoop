import "server-only";
import { randomUUID } from "node:crypto";
import type { AuthUser } from "./types";
import { getSessionHash } from "./identity";
import { identityQuery, identityTransaction } from "./identity-db";
import { digest, pkceChallenge, randomSecret, tokenVault, validSecret } from "./connected-mail/crypto";
import { applicationOrigin } from "./company-mail/config";
import { googleCalendarProvider, type CalendarCredentials } from "./driver-calendar-google";

type Status = { configured: boolean; email: string | null; revision: string | null; status: "CONNECTED" | "RECONNECT" | "DISCONNECTED" };
type Flow = { state_hash:string;tenant_id:string;user_id:string;account_id:string;session_hash:string;context_key:string;proof_hash:string;prior_revision:string|null;native:boolean;verifier_enc:string;pending_enc:string|null;status:string };
type Pending = { subject: string; email: string; credentials: CalendarCredentials };
const flowContext = (hash:string,purpose:string)=>`driver-calendar:${hash}:${purpose}`;
const credentialContext = (tenant:string,user:string)=>`driver-calendar:${tenant}:${user}:credentials`;

export function driverCalendarConfig() {
  const origin = applicationOrigin();
  const clientId = process.env.CALENDAR_GOOGLE_CLIENT_ID?.trim() || process.env.MAIL_GOOGLE_CLIENT_ID?.trim();
  const clientSecret = process.env.CALENDAR_GOOGLE_CLIENT_SECRET?.trim() || process.env.MAIL_GOOGLE_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) throw new Error("NOT_CONFIGURED");
  const key = process.env.CALENDAR_TOKEN_ENCRYPTION_KEY?.trim() || process.env.MAIL_TOKEN_ENCRYPTION_KEY?.trim() || "";
  return { provider: googleCalendarProvider({ clientId, clientSecret, redirectUri: `${origin}/api/calendar/google/callback` }), vault: tokenVault(key), origin };
}

function assertDriver(user:AuthUser) {
  if (user.role!=="DRIVER" || !user.driverId || !user.tenantId || !user.accountId || !user.contextKey) throw new Error("FORBIDDEN");
  return {tenantId:user.tenantId,accountId:user.accountId,contextKey:user.contextKey};
}

export async function driverCalendarStatus(user:AuthUser):Promise<Status>{
  const {tenantId}=assertDriver(user);
  const row=(await identityQuery<{email:string;revision:string;status:"CONNECTED"|"RECONNECT"}>("select email,revision,status from driver_calendar_connections where tenant_id=$1 and user_id=$2",[tenantId,user.id])).rows[0];
  let configured=true;try{driverCalendarConfig();}catch{configured=false;}
  return {configured,email:row?.email??null,revision:row?.revision??null,status:row?.status??"DISCONNECTED"};
}

export async function startDriverCalendar(user:AuthUser,native:boolean){
  const {tenantId,accountId,contextKey}=assertDriver(user);const sessionHash=await getSessionHash();
  if(!sessionHash)throw new Error("INVALID_FLOW");
  const {provider,vault}=driverCalendarConfig(),state=randomSecret(),proof=randomSecret(),verifier=randomSecret(),hash=digest(state);
  await identityTransaction(async c=>{
    await c.query("delete from driver_calendar_oauth_flows where expires_at<=now()");
    const attempts=(await c.query<{n:number}>("select count(*)::int n from driver_calendar_oauth_flows where tenant_id=$1 and user_id=$2 and created_at>now()-interval '10 minutes'",[tenantId,user.id])).rows[0]?.n??0;
    if(attempts>=10)throw new Error("RATE_LIMIT");
    const membership=await c.query("select 1 from app_users where id=$1 and tenant_id=$2 and account_id=$3 and role='DRIVER' and active",[user.id,tenantId,accountId]);
    if(!membership.rowCount)throw new Error("FORBIDDEN");
    const current=(await c.query<{revision:string}>("select revision from driver_calendar_connections where tenant_id=$1 and user_id=$2",[tenantId,user.id])).rows[0];
    await c.query(`insert into driver_calendar_oauth_flows(state_hash,tenant_id,user_id,account_id,session_hash,context_key,proof_hash,prior_revision,native,verifier_enc)
      values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,[hash,tenantId,user.id,accountId,sessionHash,contextKey,digest(proof),current?.revision??null,native,vault.seal(verifier,flowContext(hash,"pkce"))]);
  });
  return {state,proof,url:provider.authorizationUrl(state,pkceChallenge(verifier))};
}

export async function stageDriverCalendar(state:string,code:string|null,denied:boolean){
  if(!validSecret(state))throw new Error("INVALID_FLOW");const hash=digest(state);
  const flow=(await identityQuery<Flow>("update driver_calendar_oauth_flows set status='EXCHANGING' where state_hash=$1 and status='PENDING' and expires_at>now() returning *",[hash])).rows[0];
  if(!flow)throw new Error("INVALID_FLOW");let ok=false;
  try{
    if(denied||!code||code.length>4096)throw new Error("DENIED");
    const {provider,vault}=driverCalendarConfig();
    const pending=await provider.exchange(code,vault.open<string>(flow.verifier_enc,flowContext(hash,"pkce")));
    ok=(await identityQuery("update driver_calendar_oauth_flows set status='READY',pending_enc=$2,verifier_enc='' where state_hash=$1 and status='EXCHANGING' and expires_at>now()",[hash,vault.seal(pending,flowContext(hash,"pending"))])).rowCount===1;
  }catch{await identityQuery("update driver_calendar_oauth_flows set status='FAILED',verifier_enc='',pending_enc=null where state_hash=$1",[hash]);}
  return {native:flow.native,ok};
}

export async function finishDriverCalendar(user:AuthUser,state:string,proof:string){
  const {tenantId,accountId,contextKey}=assertDriver(user);const sessionHash=await getSessionHash();
  if(!sessionHash||!validSecret(state)||!validSecret(proof))throw new Error("INVALID_FLOW");const hash=digest(state),{vault}=driverCalendarConfig();
  return identityTransaction(async c=>{
    await c.query("select pg_advisory_xact_lock(hashtextextended($1,64001))",[`${tenantId}:${user.id}`]);
    const flow=(await c.query<Flow>(`select * from driver_calendar_oauth_flows where state_hash=$1 and tenant_id=$2 and user_id=$3 and account_id=$4
      and session_hash=$5 and context_key=$6 and proof_hash=$7 and expires_at>now() and status='READY' for update`,[hash,tenantId,user.id,accountId,sessionHash,contextKey,digest(proof)])).rows[0];
    if(!flow?.pending_enc)throw new Error("INVALID_FLOW");
    const current=(await c.query<{revision:string}>("select revision from driver_calendar_connections where tenant_id=$1 and user_id=$2 for update",[tenantId,user.id])).rows[0];
    if((current?.revision??null)!==flow.prior_revision)throw new Error("INVALID_FLOW");
    const pending=vault.open<Pending>(flow.pending_enc,flowContext(hash,"pending"));
    await c.query(`insert into driver_calendar_connections(tenant_id,user_id,provider_subject,email,credentials_enc)
      values($1,$2,$3,$4,$5) on conflict(tenant_id,user_id) do update set provider_subject=excluded.provider_subject,email=excluded.email,
      credentials_enc=excluded.credentials_enc,status='CONNECTED',revision=$6,updated_at=now()`,[tenantId,user.id,pending.subject,pending.email,vault.seal(pending.credentials,credentialContext(tenantId,user.id)),randomUUID()]);
    await c.query("delete from driver_calendar_oauth_flows where tenant_id=$1 and user_id=$2",[tenantId,user.id]);
    return pending.email;
  });
}

export async function disconnectDriverCalendar(user:AuthUser,revision:string){
  const {tenantId}=assertDriver(user);
  await identityTransaction(async c=>{await c.query("select pg_advisory_xact_lock(hashtextextended($1,64001))",[`${tenantId}:${user.id}`]);
    const deleted=await c.query("delete from driver_calendar_connections where tenant_id=$1 and user_id=$2 and revision::text=$3",[tenantId,user.id,revision]);
    if(!deleted.rowCount)throw new Error("INVALID_FLOW");await c.query("delete from driver_calendar_events where tenant_id=$1 and user_id=$2",[tenantId,user.id]);});
}

export {credentialContext};
