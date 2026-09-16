-- Registration intent controls onboarding only; institution roles still require approval.
alter table login_accounts add column registration_role text not null default 'PARENT'
 check (registration_role in ('ADMIN','DRIVER','PARENT'));
update login_accounts a set registration_role = case
 when exists(select 1 from app_users u where u.account_id=a.id and u.role='ADMIN') then 'ADMIN'
 when exists(select 1 from app_users u where u.account_id=a.id and u.role='DRIVER') then 'DRIVER'
 else 'PARENT' end;
