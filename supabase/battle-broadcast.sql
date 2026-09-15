-- Additive, repeatable migration. Never touches shared wallets or account data.
begin;
create or replace function public.balc_broadcast_capabilities() returns jsonb
language sql stable security invoker set search_path='' as $$ select jsonb_build_object('version',2) $$;

-- Each participant has an inbox. Only that participant and the HOST can access it.
-- The HOST binds action identity to the inbox topic, not an untrusted payload user field.
drop policy if exists balc_inbox_read on realtime.messages;
create policy balc_inbox_read on realtime.messages for select to authenticated using (
  extension='broadcast' and exists (
    select 1 from public.battle_rooms r where r.expires_at>now() and r.status<>'closed'
    and (auth.uid()=r.host_id or auth.uid()=r.guest_id)
    and (realtime.topic()='balc:'||r.id::text||':user:'||auth.uid()::text
      or (auth.uid()=r.host_id and realtime.topic()='balc:'||r.id::text||':user:'||r.guest_id::text))
  )
);
drop policy if exists balc_inbox_write on realtime.messages;
create policy balc_inbox_write on realtime.messages for insert to authenticated with check (
  extension='broadcast' and exists (
    select 1 from public.battle_rooms r where r.expires_at>now() and r.status<>'closed'
    and (auth.uid()=r.host_id or auth.uid()=r.guest_id)
    and (realtime.topic()='balc:'||r.id::text||':user:'||auth.uid()::text
      or (auth.uid()=r.host_id and realtime.topic()='balc:'||r.id::text||':user:'||r.guest_id::text))
  )
);

create or replace function public.balc_save_checkpoint(p_room uuid,p_base integer,p_revision integer,
  p_snapshot jsonb,p_host_view jsonb,p_guest_view jsonb,p_actions jsonb)
returns integer language plpgsql security definer set search_path='' as $$
declare r public.battle_rooms; a jsonb; old public.battle_match_actions; next_turn uuid;
begin
  select * into r from public.battle_rooms where id=p_room and host_id=balc_private.user_id()
    and expires_at>now() for update;
  if r.id is null then raise exception 'HOST_REQUIRED'; end if;
  if r.status not in ('playing','finished') or r.guest_id is null then raise exception 'MATCH_NOT_READY'; end if;
  if r.revision=p_revision and exists(select 1 from public.battle_checkpoints where room_id=p_room and snapshot=p_snapshot) then
    return p_revision; -- A lost RPC acknowledgement may be retried safely.
  end if;
  if r.revision<>p_base then raise exception 'STALE_REVISION'; end if;
  if p_base is null or p_revision is null or p_revision<=p_base or p_revision>p_base+1000
    or p_snapshot is null or p_host_view is null or p_guest_view is null or p_actions is null
    or jsonb_typeof(p_snapshot)<>'object' or jsonb_typeof(p_host_view)<>'object' or jsonb_typeof(p_guest_view)<>'object'
    or jsonb_typeof(p_actions)<>'array' or jsonb_array_length(p_actions)>1000
    or octet_length(p_snapshot::text)>262144 or octet_length(p_host_view::text)>262144
    or octet_length(p_guest_view::text)>262144 or octet_length(p_actions::text)>2097152 then
    raise exception 'INVALID_SNAPSHOT';
  end if;
  next_turn:=case p_snapshot->>'currentTurn' when 'player' then r.host_id when 'cpu' then r.guest_id else null end;
  if p_snapshot->>'gameEnded' is distinct from 'true' and next_turn is null then raise exception 'INVALID_TURN'; end if;
  if p_base=0 and (p_revision<>1 or next_turn is distinct from r.first_user) then raise exception 'INVALID_START'; end if;
  for a in select value from jsonb_array_elements(p_actions) loop
    if (a->>'user_id')::uuid not in (r.host_id,r.guest_id) or (a->>'user_id') is null
      or (a->>'request_id') is null or (a->>'base_revision') is null
      or (a->>'base_revision')::integer<p_base or (a->>'base_revision')::integer>=p_revision
      or a->'action' is null or jsonb_typeof(a->'action')<>'object' or octet_length((a->'action')::text)>2048 then
      raise exception 'INVALID_ACTION';
    end if;
    select * into old from public.battle_match_actions where room_id=p_room and request_id=(a->>'request_id')::uuid;
    if found then
      if old.user_id<>(a->>'user_id')::uuid or old.action<>a->'action'
        or old.base_revision<>(a->>'base_revision')::integer then raise exception 'REQUEST_REUSED'; end if;
    else
      insert into public.battle_match_actions values(p_room,(a->>'request_id')::uuid,(a->>'user_id')::uuid,
        (a->>'base_revision')::integer,a->'action',true);
    end if;
  end loop;
  insert into public.battle_checkpoints values(p_room,p_snapshot)
    on conflict(room_id) do update set snapshot=excluded.snapshot;
  insert into public.battle_views values(p_room,r.host_id,p_revision,p_host_view),(p_room,r.guest_id,p_revision,p_guest_view)
    on conflict(room_id,user_id) do update set revision=excluded.revision,payload=excluded.payload;
  update public.battle_rooms set revision=p_revision,turn_user=next_turn,
    status=case when p_snapshot->>'gameEnded'='true' then 'finished' else 'playing' end where id=p_room;
  return p_revision;
end $$;

create or replace function public.balc_rematch(p_room uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare r public.battle_rooms; first_id uuid;
begin
  select * into r from public.battle_rooms where id=p_room and host_id=balc_private.user_id()
    and expires_at>now() for update;
  if r.id is null then raise exception 'HOST_REQUIRED'; end if;
  if r.status<>'finished' then raise exception 'MATCH_NOT_ENDED'; end if;
  first_id:=case when random()<0.5 then r.host_id else r.guest_id end;
  update public.battle_rooms set status='playing',first_user=first_id,turn_user=first_id where id=p_room returning * into r;
  return to_jsonb(r);
end $$;
revoke all on function public.balc_broadcast_capabilities(),public.balc_save_checkpoint(uuid,integer,integer,jsonb,jsonb,jsonb,jsonb),
  public.balc_rematch(uuid) from public,anon;
grant execute on function public.balc_broadcast_capabilities(),public.balc_save_checkpoint(uuid,integer,integer,jsonb,jsonb,jsonb,jsonb),
  public.balc_rematch(uuid) to authenticated;
commit;
