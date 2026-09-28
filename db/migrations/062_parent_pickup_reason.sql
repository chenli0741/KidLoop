insert into student_status_reasons(tenant_id,id,name_zh,name_en,roles,active)
select id,'PICKED_UP_BY_PARENT','家长已接','Picked up by parent',array['DRIVER'],true
from tenants
where active
on conflict(tenant_id,id) do update set
 name_zh=excluded.name_zh,
 name_en=excluded.name_en,
 roles=excluded.roles,
 active=true,
 updated_at=clock_timestamp();
