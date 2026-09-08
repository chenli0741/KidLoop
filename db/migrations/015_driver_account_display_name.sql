-- Align the known test account with its linked driver's requested display name.
update app_users u set name=d.name,updated_at=clock_timestamp()
from drivers d
where u.driver_id=d.id and u.role='DRIVER'
  and u.email='driver@test.kidloop.local' and u.name='Test Driver'
  and d.id='37dd4080-b702-4565-ae1c-bd71c51b6376' and d.name='Driver Chen';
