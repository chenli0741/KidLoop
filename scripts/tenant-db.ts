import {Pool} from 'pg';
const tenant=process.env.KIDLOOP_TENANT_ID;
if(!tenant||!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(tenant))throw new Error('Set KIDLOOP_TENANT_ID explicitly before running an operational script');
const url=new URL(process.env.DATABASE_URL!);
if(url.searchParams.get('sslmode')==='require')url.searchParams.set('sslmode','verify-full');
const pool=new Pool({connectionString:url.toString(),options:`-c role=kidloop_runtime -c kidloop.tenant_id=${tenant}`});
export const db=pool;
