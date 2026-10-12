-- RLS isolation test. Run in the SQL editor / execute_sql.
-- Passing run ends with: ERROR P0001: RLS_TEST_OK (the transaction is rolled back on purpose).
do $$
declare
  ua uuid := gen_random_uuid();
  ub uuid := gen_random_uuid();
  hid uuid;
  n int;
begin
  insert into auth.users(id, instance_id, aud, role, email) values
    (ua, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'a@test.local'),
    (ub, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'b@test.local');

  perform set_config('request.jwt.claims', json_build_object('sub', ua, 'role', 'authenticated')::text, true);
  set local role authenticated;
  hid := public.create_household('A home');
  insert into public.fridge_items(household_id, name) values (hid, 'mleko');
  select count(*) into n from public.fridge_items;
  if n <> 1 then raise exception 'A should see 1 item, saw %', n; end if;

  perform set_config('request.jwt.claims', json_build_object('sub', ub, 'role', 'authenticated')::text, true);
  select count(*) into n from public.fridge_items;
  if n <> 0 then raise exception 'B leaked % items', n; end if;
  begin
    insert into public.fridge_items(household_id, name) values (hid, 'intruder');
    raise exception 'B insert should have failed';
  exception when insufficient_privilege or others then
    if sqlerrm = 'B insert should have failed' then raise; end if;
  end;

  begin
    perform 1 from public.user_secrets;
    raise exception 'user_secrets readable';
  exception when insufficient_privilege then null;
  end;

  raise exception 'RLS_TEST_OK';
end $$;
