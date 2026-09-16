import { randomUUID } from "node:crypto";
import type { PoolClient, QueryResult, QueryResultRow } from "pg";
import { digest, pkceChallenge, randomSecret, validSecret, tokenVault } from "./crypto";
import { MailError, type AuthorizedMailbox, type MailCredentials, type MailMessage, type MailProvider } from "./types";

export type MailDatabase = {
  query<T extends QueryResultRow = QueryResultRow>(sql: string, values?: unknown[]): Promise<QueryResult<T>>;
  transaction<T>(work: (client: PoolClient) => Promise<T>): Promise<T>;
};
export type MailRuntime = { provider: MailProvider; vault: ReturnType<typeof tokenVault> };
export type MailActor = { ownerKey: string; actorId: string; sessionHash: string; contextKey: string };
const credentialContext = (owner: string) => `mail:${owner}:credentials`;
const flowContext = (stateHash: string, purpose: string) => `mail:${stateHash}:${purpose}`;
type Connection = { owner_key: string; revision: string; email: string; credentials_enc: string; status: "CONNECTED" | "RECONNECT" };
type Flow = { state_hash: string; owner_key: string; actor_id: string; session_hash: string; context_key: string; prior_revision: string | null; native: boolean; verifier_enc: string; pending_enc: string | null; status: string };
export type MailDelivery = { recipient: string; sender: string; status: "SENDING" | "SENT" | "FAILED" | "UNKNOWN"; error_code: string | null; created_at: string };
export type MailStatus = { configured: boolean; email: string | null; revision: string | null; status: "CONNECTED" | "RECONNECT" | "DISCONNECTED" };


/** Callback stages credentials only; the initiating authenticated document must finish binding. */
export async function stageMailAuthorization(database: MailDatabase, configuration: () => MailRuntime, state: string, code: string | null, denied: boolean) {
  const identityQuery = database.query;
  if (!validSecret(state)) throw new MailError("INVALID_FLOW");
  const hash = digest(state);
  const flow = (await identityQuery<Flow>(`update mail_oauth_flows set status='EXCHANGING'
    where state_hash=$1 and status='PENDING' and expires_at>now() returning *`, [hash])).rows[0];
  if (!flow) throw new MailError("INVALID_FLOW");
  let ok = false;
  try {
    if (denied || !code || code.length > 4096) throw new MailError("INVALID_FLOW");
    const { provider, vault } = configuration();
    const mailbox = await provider.exchange(code, vault.open<string>(flow.verifier_enc, flowContext(hash, "pkce")));
    const updated = await identityQuery(`update mail_oauth_flows set status='READY',pending_enc=$2,verifier_enc=''
      where state_hash=$1 and status='EXCHANGING' and expires_at>now()`, [hash, vault.seal(mailbox, flowContext(hash, "pending"))]);
    ok = updated.rowCount === 1;
  } catch {
    await identityQuery("update mail_oauth_flows set status='FAILED',verifier_enc='',pending_enc=null where state_hash=$1", [hash]);
  }
  return { native: flow.native, ok };
}

/** The host authenticates the actor and revalidates authorization inside every transaction. */
export function createConnectedMail(options: {
  database: MailDatabase;
  configuration: () => MailRuntime;
  actor: MailActor;
  authorize: (client: PoolClient) => Promise<void>;
  audit: (client: PoolClient, action: string) => Promise<void>;
}) {
  const { database, configuration, actor, authorize, audit } = options;
  const identityQuery = database.query, identityTransaction = database.transaction;

  async function authorizedConnection() {
    return identityTransaction(async c => {
      await authorize(c);
      return (await c.query<Connection>("select * from mail_connections where owner_key=$1", [actor.ownerKey])).rows[0];
    });
  }
  async function status(): Promise<MailStatus> {
    const connection = await authorizedConnection();
    let configured = true; try { configuration(); } catch { configured = false; }
    return { configured, email: connection?.email ?? null, revision: connection?.revision ?? null, status: connection?.status ?? "DISCONNECTED" };
  }
  async function history(): Promise<MailDelivery[]> {
    return identityTransaction(async c => {
      await authorize(c);
      return (await c.query<MailDelivery>(`select recipient,sender,
        case when status='SENDING' and created_at<now()-interval '2 minutes' then 'UNKNOWN' else status end status,
        error_code,created_at::text from mail_deliveries where owner_key=$1 order by created_at desc limit 20`, [actor.ownerKey])).rows;
    });
  }
  async function assertReady() {
    configuration();
    const connection = await authorizedConnection();
    if (!connection) throw new MailError("NOT_CONNECTED");
    if (connection.status !== "CONNECTED") throw new MailError("RECONNECT");
  }
  async function start(native: boolean) {
    const { provider, vault } = configuration();
    const state = randomSecret(), proof = randomSecret(), verifier = randomSecret();
    const hash = digest(state);
    await identityTransaction(async c => {
      await authorize(c);
      await c.query("delete from mail_oauth_flows where expires_at<=now()");
      const attempts = (await c.query("select count(*)::int n from mail_oauth_flows where owner_key=$1 and created_at>now()-interval '10 minutes'", [actor.ownerKey])).rows[0].n;
      if (attempts >= 10) throw new MailError("RATE_LIMIT");
      const current = (await c.query<{revision: string}>("select revision from mail_connections where owner_key=$1", [actor.ownerKey])).rows[0];
      await c.query(`insert into mail_oauth_flows(state_hash,owner_key,actor_id,session_hash,context_key,proof_hash,prior_revision,native,verifier_enc)
        values($1,$2,$3,$4,$5,$6,$7,$8,$9)`, [hash, actor.ownerKey, actor.actorId, actor.sessionHash, actor.contextKey,
        digest(proof), current?.revision ?? null, native, vault.seal(verifier, flowContext(hash, "pkce"))]);
    });
    // The completion proof is NEVER included in the Google URL or callback URL.
    return { state, proof, url: provider.authorizationUrl(state, pkceChallenge(verifier)) };
  }

  async function finish(state: string, proof: string) {
    if (!validSecret(state) || !validSecret(proof)) throw new MailError("INVALID_FLOW");
    const { vault } = configuration();
    return identityTransaction(async c => {
      await authorize(c);
      // Serialize all replacements/disconnections for a company, including different administrators.
      await c.query("select pg_advisory_xact_lock(hashtextextended($1,57001))", [actor.ownerKey]);
      const flow = (await c.query<Flow>(`select * from mail_oauth_flows where state_hash=$1 and owner_key=$2 and actor_id=$3
        and session_hash=$4 and context_key=$5 and proof_hash=$6 and expires_at>now() and status='READY' for update`,
      [digest(state), actor.ownerKey, actor.actorId, actor.sessionHash, actor.contextKey, digest(proof)])).rows[0];
      if (!flow?.pending_enc) throw new MailError("INVALID_FLOW");
      const current = (await c.query<{revision: string}>("select revision from mail_connections where owner_key=$1 for update", [actor.ownerKey])).rows[0];
      if ((current?.revision ?? null) !== flow.prior_revision) throw new MailError("INVALID_FLOW");
      const mailbox = vault.open<AuthorizedMailbox>(flow.pending_enc, flowContext(flow.state_hash, "pending"));
      await c.query(`insert into mail_connections(owner_key,provider,provider_subject,email,credentials_enc,connected_by)
        values($1,'google',$2,$3,$4,$5) on conflict(owner_key) do update set provider_subject=excluded.provider_subject,
        email=excluded.email,credentials_enc=excluded.credentials_enc,connected_by=excluded.connected_by,
        status='CONNECTED',revision=$6,updated_at=now()`, [actor.ownerKey, mailbox.subject, mailbox.email,
        vault.seal(mailbox.credentials, credentialContext(actor.ownerKey)), actor.actorId, randomUUID()]);
      await c.query("delete from mail_oauth_flows where owner_key=$1", [actor.ownerKey]);
      await audit(c, "MAIL_CONNECTED");
      return mailbox.email;
    });
  }
  async function disconnect(expectedRevision: string) {
    await identityTransaction(async c => {
      await authorize(c);
      await c.query("select pg_advisory_xact_lock(hashtextextended($1,57001))", [actor.ownerKey]);
      const deleted = await c.query("delete from mail_connections where owner_key=$1 and revision::text=$2", [actor.ownerKey, expectedRevision]);
      if (!deleted.rowCount) throw new MailError("INVALID_FLOW");
      await c.query("delete from mail_oauth_flows where owner_key=$1", [actor.ownerKey]);
      await audit(c, "MAIL_DISCONNECTED");
    });
    // Local disconnect deletes our credential. Global Google revocation would also revoke other companies using this Google account/client.
  }
  async function send(messageKey: string, message: MailMessage) {
    const { provider, vault } = configuration();
    const prepared = await identityTransaction(async c => {
      await authorize(c);
      const connection = (await c.query<Connection>("select * from mail_connections where owner_key=$1 for share", [actor.ownerKey])).rows[0];
      if (!connection) throw new MailError("NOT_CONNECTED");
      if (connection.status !== "CONNECTED") throw new MailError("RECONNECT");
      const inserted = await c.query(`insert into mail_deliveries(owner_key,message_key,connection_revision,recipient,sender)
        values($1,$2,$3,$4,$5) on conflict do nothing returning message_key`,
      [actor.ownerKey, messageKey, connection.revision, message.to, connection.email]);
      if (!inserted.rowCount) {
        const old = (await c.query<{status: string; provider_message_id: string}>("select status,provider_message_id from mail_deliveries where owner_key=$1 and message_key=$2", [actor.ownerKey, messageKey])).rows[0];
        if (old.status !== "SENT") throw new MailError("DELIVERY_UNKNOWN");
        return { connection, sent: old.provider_message_id };
      }
      return { connection, sent: null };
    });
    if (prepared.sent) return prepared.sent;
    const connection = prepared.connection;
    let sendStarted = false;
    try {
      const refreshed = await provider.refresh(vault.open<MailCredentials>(connection.credentials_enc, credentialContext(actor.ownerKey)));
      // Recheck both administrator session and connection revision immediately before sending.
      await identityTransaction(async c => {
        await authorize(c);
        const updated = await c.query(`update mail_connections set credentials_enc=$3 where owner_key=$1 and revision=$2 and status='CONNECTED' returning owner_key`,
        [actor.ownerKey, connection.revision, vault.seal(refreshed.credentials, credentialContext(actor.ownerKey))]);
        if (!updated.rowCount) throw new MailError("NOT_CONNECTED");
      });
      sendStarted = true;
      const id = await provider.send(refreshed.accessToken, connection.email, message);
      await identityQuery("update mail_deliveries set status='SENT',provider_message_id=$3,updated_at=now() where owner_key=$1 and message_key=$2", [actor.ownerKey, messageKey, id]);
      return id;
    } catch (error) {
      const code = error instanceof MailError ? error.code : sendStarted ? "DELIVERY_UNKNOWN" : "PROVIDER_ERROR";
      if (code === "RECONNECT") await identityQuery("update mail_connections set status='RECONNECT',updated_at=now() where owner_key=$1 and revision=$2", [actor.ownerKey, connection.revision]);
      await identityQuery("update mail_deliveries set status=$3,error_code=$4,updated_at=now() where owner_key=$1 and message_key=$2",
        [actor.ownerKey, messageKey, code === "DELIVERY_UNKNOWN" ? "UNKNOWN" : "FAILED", code]);
      throw new MailError(code);
    }
  }

  return { history, status, assertReady, start, finish, disconnect, send };
}
