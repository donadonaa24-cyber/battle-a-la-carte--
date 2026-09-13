-- Apply after battle-online.sql, to the SAME common project. Safe to reapply.
begin;
alter table public.battle_rooms add column if not exists first_user uuid references auth.users(id);
update public.battle_rooms set first_user=host_id where guest_id is not null and first_user is null;
create or replace function balc_private.user_id() returns uuid language plpgsql security definer set search_path='' as $$
begin
  if auth.uid() is null then raise exception 'LOGIN_REQUIRED'; end if;
  return auth.uid();
end $$;
create or replace function public.balc_join_room(p_code text,p_info jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.battle_rooms; u uuid:=balc_private.user_id();
begin
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(u::text,0));
    if not balc_private.rate_limit() then return jsonb_build_object('error','RATE_LIMIT'); end if;
    if p_code !~ '^[0-9]{6}$' then return jsonb_build_object('error','ROOM_NOT_FOUND'); end if;
    if octet_length(p_info::text)>1024 or jsonb_typeof(p_info)<>'object' then raise exception 'INVALID_INFO'; end if;
    select * into r from public.battle_rooms where code=p_code and status='waiting' and created_at>now()-interval '15 minutes' for update;
    if r.id is null or r.host_id=u or r.guest_id is not null then return jsonb_build_object('error','ROOM_NOT_FOUND'); end if;
    if exists(select 1 from public.battle_rooms where (host_id=u or guest_id=u) and status in ('waiting','playing') and expires_at>now()) then
      return jsonb_build_object('error','ROOM_ALREADY_ACTIVE'); end if;
    update public.battle_rooms set guest_id=u, guest_info=p_info,status='playing',first_user=case when random()<0.5 then host_id else u end where id=r.id returning * into r;
    update public.battle_rooms set turn_user=first_user where id=r.id returning * into r;
    return to_jsonb(r);
end $$;
create or replace function public.balc_commit(p_room uuid,p_revision integer,p_request uuid,p_snapshot jsonb,p_host_view jsonb,p_guest_view jsonb)
returns integer language plpgsql security definer set search_path='' as $$
declare r public.battle_rooms; a public.battle_match_actions; next_turn uuid; next_status text; u uuid:=balc_private.user_id();
begin
    select * into r from public.battle_rooms where id=p_room and host_id=u and expires_at>now() for update;
    if r.id is null then raise exception 'HOST_REQUIRED'; end if;
    if r.revision<>p_revision then raise exception 'STALE_REVISION'; end if;
    if r.status<>'playing' or r.guest_id is null then raise exception 'MATCH_NOT_READY'; end if;
    if p_revision=0 then
      if p_request is not null or (p_snapshot->>'currentTurn') is distinct from (case when coalesce(r.first_user,r.host_id)=r.host_id then 'player' else 'cpu' end) then raise exception 'INVALID_START'; end if;
    else
      select * into a from public.battle_match_actions where room_id=p_room and request_id=p_request and base_revision=p_revision and not processed;
      if a.request_id is null then raise exception 'ACTION_REQUIRED'; end if;
      update public.battle_match_actions set processed=true where room_id=p_room and request_id=p_request;
    end if;
    if p_snapshot is null or p_host_view is null or p_guest_view is null
      or octet_length(p_snapshot::text)>262144 or octet_length(p_host_view::text)>262144 or octet_length(p_guest_view::text)>262144 then
      raise exception 'INVALID_SNAPSHOT'; end if;
    next_status:=case when p_snapshot->>'gameEnded'='true' then 'finished' else 'playing' end;
    next_turn:=case p_snapshot->>'currentTurn' when 'player' then r.host_id when 'cpu' then r.guest_id else null end;
    if next_status='playing' and next_turn is null then raise exception 'INVALID_TURN'; end if;
    insert into public.battle_checkpoints values(p_room,p_snapshot) on conflict(room_id) do update set snapshot=excluded.snapshot;
    insert into public.battle_views values(p_room,r.host_id,p_revision+1,p_host_view),(p_room,r.guest_id,p_revision+1,p_guest_view)
      on conflict(room_id,user_id) do update set revision=excluded.revision,payload=excluded.payload;
    update public.battle_rooms set revision=p_revision+1,turn_user=next_turn,status=next_status where id=p_room;
    return p_revision+1;
end $$;
-- Preserve the shared economy's registration requirement. No balances are changed.
-- The existing ensure_user implementation remains intact behind this guard.
do $migration$ begin
  if to_regprocedure('aniani_private.ensure_user()') is not null
     and to_regprocedure('aniani_private.ensure_registered_user_original()') is null then
    alter function aniani_private.ensure_user() rename to ensure_registered_user_original;
    revoke all on function aniani_private.ensure_registered_user_original() from public,anon,authenticated;
    execute $ddl$create function aniani_private.ensure_user() returns uuid language plpgsql security definer set search_path='' as $body$
    begin
      if auth.uid() is null or coalesce((auth.jwt()->>'is_anonymous')::boolean,false) then
        raise exception 'LOGIN_REQUIRED' using errcode='28000';
      end if;
      return aniani_private.ensure_registered_user_original();
    end $body$$ddl$;
    revoke all on function aniani_private.ensure_user() from public,anon,authenticated;
  end if;
end $migration$;
create table if not exists public.battle_chat_messages (
  room_id uuid not null references public.battle_rooms(id) on delete cascade,
  request_id uuid not null,
  user_id uuid not null references auth.users(id),
  phrase text not null check (phrase in ('hello','thanks','wait','ready','good','sorry')),
  created_at timestamptz not null default clock_timestamp(),
  primary key(room_id,request_id)
);
create index if not exists battle_chat_recent on public.battle_chat_messages(room_id,created_at desc);
create table if not exists balc_private.chat_cooldowns (
  user_id uuid primary key references auth.users(id) on delete cascade,
  sent_at timestamptz not null
);
alter table public.battle_chat_messages enable row level security;
alter table balc_private.chat_cooldowns enable row level security;
revoke all on public.battle_chat_messages,balc_private.chat_cooldowns from public,anon,authenticated;
grant select on public.battle_chat_messages to authenticated;
drop policy if exists battle_chat_members on public.battle_chat_messages;
create policy battle_chat_members on public.battle_chat_messages for select to authenticated
using (exists(select 1 from public.battle_rooms r where r.id=room_id));
create or replace function public.balc_send_chat(p_room uuid,p_request uuid,p_phrase text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=balc_private.user_id(); m public.battle_chat_messages; last_sent timestamptz; t timestamptz;
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(u::text,42));
  perform 1 from public.battle_rooms where id=p_room and (host_id=u or guest_id=u)
    and expires_at>now() and status in ('waiting','playing','finished') for share;
  if not found then raise exception 'ROOM_NOT_FOUND'; end if;
  select * into m from public.battle_chat_messages where room_id=p_room and request_id=p_request;
  if found then
    if m.user_id<>u or m.phrase is distinct from p_phrase then raise exception 'REQUEST_REUSED'; end if;
    return to_jsonb(m);
  end if;
  if p_request is null or p_phrase is null or p_phrase not in ('hello','thanks','wait','ready','good','sorry') then raise exception 'INVALID_CHAT'; end if;
  t:=clock_timestamp();
  select sent_at into last_sent from balc_private.chat_cooldowns where user_id=u;
  if last_sent > t-interval '5 seconds' then raise exception 'CHAT_COOLDOWN'; end if;
  insert into balc_private.chat_cooldowns values(u,t) on conflict(user_id) do update set sent_at=excluded.sent_at;
  insert into public.battle_chat_messages values(p_room,p_request,u,p_phrase,t) returning * into m;
  return to_jsonb(m);
end $$;
revoke all on function public.balc_send_chat(uuid,uuid,text) from public,anon;
grant execute on function public.balc_send_chat(uuid,uuid,text) to authenticated;
do $$ begin
  if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='battle_chat_messages') then
    alter publication supabase_realtime add table public.battle_chat_messages;
  end if;
end $$;
commit;
