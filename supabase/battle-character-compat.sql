-- U6a additive, repeatable roster capability guard. Apply after battle-public-match.sql.
-- Must be applied before U6b enables new selections. No game/reward/protocol revision changes.
begin;
create or replace function balc_private.has_eight_characters(info jsonb) returns boolean
language sql immutable set search_path='' as $$
  select coalesce(case when jsonb_typeof(info->'characterRosterVersion')='number'
    and (info->>'characterRosterVersion') ~ '^[0-9]+$'
    then (info->>'characterRosterVersion')::numeric between 2 and 9007199254740991 else false end,false)
$$;
create or replace function balc_private.check_character_compatibility() returns trigger
language plpgsql set search_path='' as $$
declare h text:=new.host_info->>'character'; g text:=new.guest_info->>'character'; needs_eight boolean;
begin
  -- Legacy RPC fixtures may omit a character, but cannot advertise an unknown/new ID.
  if (h is not null and h not in ('chizuru','mai','takumi','akatsuki','kanna','tsuyoshi','yuzuki','ryuta'))
    or (g is not null and g not in ('chizuru','mai','takumi','akatsuki','kanna','tsuyoshi','yuzuki','ryuta')) then
    raise exception 'INVALID_SELECTION';
  end if;
  needs_eight:=coalesce(h in ('kanna','tsuyoshi','yuzuki','ryuta'),false)
    or coalesce(g in ('kanna','tsuyoshi','yuzuki','ryuta'),false);
  if needs_eight and (not balc_private.has_eight_characters(new.host_info)
    or (new.guest_id is not null and not balc_private.has_eight_characters(new.guest_info))) then
    -- Cached Web already maps ENGINE_ERROR to reload/update guidance. Released Unity
    -- displays the Postgrest response including details; new Unity maps this explicitly.
    raise exception using message='ENGINE_ERROR',
      detail='最新版に更新してください。Web版はページを再読み込みしてください。';
  end if;
  return new;
end $$;
revoke all on function balc_private.has_eight_characters(jsonb),
  balc_private.check_character_compatibility() from public,anon,authenticated;
drop trigger if exists balc_character_compatibility on public.battle_rooms;
create trigger balc_character_compatibility before insert or update of host_info,guest_info,guest_id
  on public.battle_rooms for each row execute function balc_private.check_character_compatibility();
commit;
