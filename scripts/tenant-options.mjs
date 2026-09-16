/** Operational scripts require an explicit institution and run under database isolation. */
export function tenantOptions() {
  const tenant = process.env.KIDLOOP_TENANT_ID;
  if (!tenant || !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(tenant)) {
    throw new Error('Set KIDLOOP_TENANT_ID explicitly. Operational scripts cannot run across institutions.');
  }
  return `-c role=kidloop_runtime -c kidloop.tenant_id=${tenant}`;
}
