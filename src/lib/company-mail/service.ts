import "server-only";
import { identityQuery, identityTransaction } from "../identity-db";
import { invitationAdmin } from "../invitations";
import type { AuthUser } from "../types";
import { getSessionHash } from "../identity";
import { createConnectedMail, stageMailAuthorization } from "../connected-mail/service";
import { MailError, type MailMessage } from "../connected-mail/types";
import { companyMailConfig } from "./config";
export type { MailStatus } from "../connected-mail/service";
const database = { query: identityQuery, transaction: identityTransaction };

async function companyMail(admin: AuthUser) {
  const sessionHash = await getSessionHash();
  if (!sessionHash || !admin.tenantId || !admin.accountId || !admin.contextKey) throw new MailError("INVALID_FLOW");
  return createConnectedMail({
    database, configuration: companyMailConfig,
    actor: { ownerKey: admin.tenantId, actorId: admin.accountId, sessionHash, contextKey: admin.contextKey },
    authorize: c => invitationAdmin(c, admin),
    audit: async (c, action) => { await c.query("insert into tenant_audit(tenant_id,account_id,action) values($1,$2,$3)", [admin.tenantId, admin.accountId, action]); },
  });
}
export async function companyMailStatus(admin: AuthUser) { return (await companyMail(admin)).status(); }
export async function companyMailHistory(admin: AuthUser) { return (await companyMail(admin)).history(); }
export async function assertCompanyMailReady(admin: AuthUser) { return (await companyMail(admin)).assertReady(); }
export async function startCompanyMail(admin: AuthUser, native: boolean) { return (await companyMail(admin)).start(native); }
export async function finishCompanyMail(admin: AuthUser, state: string, proof: string) { return (await companyMail(admin)).finish(state, proof); }
export async function disconnectCompanyMail(admin: AuthUser, revision: string) { return (await companyMail(admin)).disconnect(revision); }
export async function sendCompanyMail(admin: AuthUser, key: string, message: MailMessage) { return (await companyMail(admin)).send(key, message); }
export async function stageCompanyMail(state: string, code: string | null, denied: boolean) {
  return stageMailAuthorization(database, companyMailConfig, state, code, denied);
}
