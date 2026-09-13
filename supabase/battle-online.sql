-- Apply ONCE to aniani-common. Does not modify any aniani_* tables or rewards.
begin;
create schema if not exists balc_private;
revoke all on schema balc_private from public, anon, authenticated;

create table public.battle_rooms (
    id uuid primary key default gen_random_uuid(),
    code text not null check (code ~ '^[0-9]{6}$'),
    host_id uuid not null references auth.users(id),
    guest_id uuid references auth.users(id),
    host_info jsonb not null, guest_info jsonb,
    status text not null default 'waiting' check (status in ('waiting','playing','finished','closed')),
    revision integer not null default 0,
    turn_user uuid references auth.users(id),
    protocol integer not null default 1,
    expires_at timestamptz not null default now() + interval '24 hours',
    created_at timestamptz not null default now(),
    check (host_id is distinct from guest_id)
);
create unique index battle_room_open_code on public.battle_rooms(code) where status='waiting';
create table public.battle_checkpoints (
    room_id uuid primary key references public.battle_rooms(id) on delete cascade,
    snapshot jsonb not null
);
create table public.battle_views (
    room_id uuid not null references public.battle_rooms(id) on delete cascade,
    user_id uuid not null references auth.users(id),
    revision integer not null, payload jsonb not null,
    primary key(room_id,user_id)
);
create table public.battle_match_actions (
    room_id uuid not null references public.battle_rooms(id) on delete cascade,
    request_id uuid not null, user_id uuid not null references auth.users(id),
    base_revision integer not null, action jsonb not null,
    processed boolean not null default false,
    primary key(room_id,request_id), unique(room_id,base_revision)
);
create table balc_private.attempts (
    user_id uuid primary key references auth.users(id) on delete cascade,
    since_at timestamptz not null default now(), attempts integer not null default 0
);
alter table public.battle_rooms enable row level security;
alter table public.battle_checkpoints enable row level security;
alter table public.battle_views enable row level security;
alter table public.battle_match_actions enable row level security;
alter table balc_private.attempts enable row level security;
revoke all on public.battle_rooms, public.battle_checkpoints, public.battle_views, public.battle_match_actions from public, anon, authenticated;
grant select on public.battle_rooms, public.battle_checkpoints, public.battle_views, public.battle_match_actions to authenticated;
create policy battle_members on public.battle_rooms for select to authenticated
    using ((auth.uid()=host_id or auth.uid()=guest_id) and expires_at>now());
create policy battle_host_checkpoint on public.battle_checkpoints for select to authenticated
    using (exists(select 1 from public.battle_rooms r where r.id=room_id and r.host_id=auth.uid()));
create policy battle_own_view on public.battle_views for select to authenticated
    using (user_id=auth.uid() and exists(select 1 from public.battle_rooms r where r.id=room_id));
create policy battle_action_reader on public.battle_match_actions for select to authenticated
    using (exists(select 1 from public.battle_rooms r where r.id=room_id and (r.host_id=auth.uid() or user_id=auth.uid())));

create function balc_private.user_id() returns uuid language plpgsql security definer set search_path='' as $$
begin
    if auth.uid() is null or coalesce((auth.jwt()->>'is_anonymous')::boolean,false) then
        raise exception 'LOGIN_REQUIRED';
    end if;
    return auth.uid();
end $$;
create function balc_private.rate_limit() returns boolean language plpgsql security definer set search_path='' as $$
declare n integer;
begin
    insert into balc_private.attempts(user_id,attempts) values(balc_private.user_id(),1)
    on conflict(user_id) do update set
      attempts=case when balc_private.attempts.since_at < now()-interval '10 minutes' then 1 else balc_private.attempts.attempts+1 end,
      since_at=case when balc_private.attempts.since_at < now()-interval '10 minutes' then now() else balc_private.attempts.since_at end
    returning attempts into n;
    return n<=20;
end $$;
create function public.balc_create_room(p_info jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.battle_rooms; n integer; code_value text; u uuid:=balc_private.user_id();
begin
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(u::text,0));
    if not balc_private.rate_limit() then return jsonb_build_object('error','RATE_LIMIT'); end if;
    if octet_length(p_info::text)>1024 or jsonb_typeof(p_info)<>'object' then raise exception 'INVALID_INFO'; end if;
    update public.battle_rooms set status='closed' where status='waiting' and created_at<now()-interval '15 minutes';
    if exists(select 1 from public.battle_rooms where (host_id=u or guest_id=u) and status in ('waiting','playing') and expires_at>now()) then
      return jsonb_build_object('error','ROOM_ALREADY_ACTIVE'); end if;
    for n in 1..20 loop
      code_value:=lpad(floor(random()*1000000)::integer::text,6,'0');
      begin
        insert into public.battle_rooms(code,host_id,host_info) values(code_value,u,p_info) returning * into r;
        return to_jsonb(r);
      exception when unique_violation then null;
      end;
    end loop;
    return jsonb_build_object('error','RETRY');
end $$;
create function public.balc_join_room(p_code text,p_info jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
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
    update public.battle_rooms set guest_id=u, guest_info=p_info,status='playing',turn_user=host_id where id=r.id returning * into r;
    return to_jsonb(r);
end $$;
create function public.balc_submit_action(p_room uuid,p_request uuid,p_revision integer,p_action jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare r public.battle_rooms; a public.battle_match_actions; u uuid:=balc_private.user_id();
begin
    select * into r from public.battle_rooms where id=p_room and (host_id=u or guest_id=u) and expires_at>now() for update;
    if r.id is null then raise exception 'ROOM_NOT_FOUND'; end if;
    select * into a from public.battle_match_actions where room_id=p_room and request_id=p_request;
    if a.request_id is not null then
      if a.user_id<>u or a.action<>p_action or a.base_revision<>p_revision then raise exception 'REQUEST_REUSED'; end if;
      return jsonb_build_object('ok',true,'processed',a.processed);
    end if;
    if r.status<>'playing' or r.revision=0 then raise exception 'MATCH_NOT_READY'; end if;
    if r.turn_user<>u then raise exception 'NOT_YOUR_TURN'; end if;
    if r.revision<>p_revision then raise exception 'STALE_REVISION'; end if;
    if p_action is null or jsonb_typeof(p_action)<>'object' or octet_length(p_action::text)>2048 then raise exception 'INVALID_ACTION'; end if;
    insert into public.battle_match_actions(room_id,request_id,user_id,base_revision,action) values(p_room,p_request,u,p_revision,p_action);
    return jsonb_build_object('ok',true,'processed',false);
end $$;
create function public.balc_commit(p_room uuid,p_revision integer,p_request uuid,p_snapshot jsonb,p_host_view jsonb,p_guest_view jsonb)
returns integer language plpgsql security definer set search_path='' as $$
declare r public.battle_rooms; a public.battle_match_actions; next_turn uuid; next_status text; u uuid:=balc_private.user_id();
begin
    select * into r from public.battle_rooms where id=p_room and host_id=u and expires_at>now() for update;
    if r.id is null then raise exception 'HOST_REQUIRED'; end if;
    if r.revision<>p_revision then raise exception 'STALE_REVISION'; end if;
    if r.status<>'playing' or r.guest_id is null then raise exception 'MATCH_NOT_READY'; end if;
    if p_revision=0 then
      if p_request is not null or p_snapshot->>'currentTurn'<>'player' then raise exception 'INVALID_START'; end if;
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
create function public.balc_leave_room(p_room uuid) returns void language plpgsql security definer set search_path='' as $$
begin
    update public.battle_rooms set status='closed',turn_user=null
      where id=p_room and (host_id=balc_private.user_id() or guest_id=balc_private.user_id());
end $$;

revoke all on all functions in schema balc_private from public,anon,authenticated;
revoke all on function public.balc_create_room(jsonb),public.balc_join_room(text,jsonb),
 public.balc_submit_action(uuid,uuid,integer,jsonb),public.balc_commit(uuid,integer,uuid,jsonb,jsonb,jsonb),public.balc_leave_room(uuid) from public,anon;
grant execute on function public.balc_create_room(jsonb),public.balc_join_room(text,jsonb),
 public.balc_submit_action(uuid,uuid,integer,jsonb),public.balc_commit(uuid,integer,uuid,jsonb,jsonb,jsonb),public.balc_leave_room(uuid) to authenticated;

-- Only room members may use this Presence topic. No game state is broadcast here.
create policy balc_presence_read on realtime.messages for select to authenticated using (
    extension='presence' and exists(select 1 from public.battle_rooms r where 'balc:'||r.id::text=realtime.topic())
);
create policy balc_presence_write on realtime.messages for insert to authenticated with check (
    extension='presence' and exists(select 1 from public.battle_rooms r where 'balc:'||r.id::text=realtime.topic())
);
-- Never publish checkpoints: they include both players' private cards.
do $$ declare t text; begin
    foreach t in array array['battle_rooms','battle_views','battle_match_actions'] loop
      if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename=t) then
        execute format('alter publication supabase_realtime add table public.%I',t);
      end if;
    end loop;
end $$;
commit;
