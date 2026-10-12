-- Invite codes: 128 bits from a CSPRNG instead of 32 bits from md5(random()).
alter table public.households
  alter column invite_code set default replace(gen_random_uuid()::text, '-', '');

update public.households set invite_code = replace(gen_random_uuid()::text, '-', '');
