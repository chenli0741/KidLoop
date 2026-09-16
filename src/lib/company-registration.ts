import "server-only";
import type { PoolClient } from "pg";
import { createTenant } from "./tenant-service";
export type CompanyRegistration = {name:string;email:string;passwordHash:string;companyName:string;phone:string;address:string};
export async function registerCompany(c:PoolClient,input:CompanyRegistration) {
  if(!input.name.trim() || input.name.length>100 || !input.companyName.trim() || input.companyName.length>100 || !input.phone.trim() || input.phone.length>80 || !input.address.trim() || input.address.length>500 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email) || input.email.length>254)throw new Error('invalid');
  await c.query('select pg_advisory_xact_lock(hashtextextended($1,56001))',[input.email.toLowerCase().trim()]);
  const account=(await c.query("insert into login_accounts(name,email,password_hash,registration_role) values($1,$2,$3,'ADMIN') returning id",[input.name.trim(),input.email.toLowerCase().trim(),input.passwordHash])).rows[0];
  const tenantId=await createTenant(c,account.id,input.companyName);
  await c.query('update tenants set contact_name=$2,contact_email=$3,phone=$4,address=$5 where id=$1',[tenantId,input.name.trim(),input.email.toLowerCase().trim(),input.phone.trim(),input.address.trim()]);
  return {accountId:account.id as string,tenantId};
}
