-- User-requested display names. Driver IDs and account/route links stay intact.
update drivers set name='Driver Chen',updated_at=clock_timestamp()
where id='37dd4080-b702-4565-ae1c-bd71c51b6376' and name='Test Driver 01';
update drivers set name='Driver Lina',updated_at=clock_timestamp()
where id='e0c211ee-f8bf-4bec-a851-252765e6a391' and name='Test Driver 02';
