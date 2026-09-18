-- Additive, repeatable migration for public free-match rooms.
-- Apply after battle-guest-chat.sql. Shared accounts, wallets and rewards are not changed.
begin;

alter table public.battle_rooms add column if not exists is_public boolean not null default false;
create index if not exists battle_room_public_waiting
  on public.battle_rooms(created_at desc) where status='waiting' and is_public=true;

create or replace function public.balc_list_public_rooms() returns jsonb
language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
  perform balc_private.user_id();
  update public.battle_rooms set status='closed'
    where status='waiting' and created_at<now()-interval '15 minutes';
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',q.id,'host_name',q.host_name,'created_at',q.created_at
  ) order by q.created_at desc),'[]'::jsonb) into result
  from (
    select id,coalesce(nullif(host_info->>'name',''),'プレイヤー') as host_name,created_at
    from public.battle_rooms
    where status='waiting' and is_public=true and guest_id is null
      and created_at>now()-interval '15 minutes' and expires_at>now()
    order by created_at desc limit 20
  ) q;
  return result;
end $$;

create or replace function public.balc_create_public_room(p_info jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare r public.battle_rooms; n integer; code_value text; u uuid:=balc_private.user_id();
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(u::text,0));
  if not balc_private.rate_limit() then return jsonb_build_object('error','RATE_LIMIT'); end if;
  if octet_length(p_info::text)>1024 or jsonb_typeof(p_info)<>'object' then raise exception 'INVALID_INFO'; end if;
  update public.battle_rooms set status='closed' where status='waiting' and created_at<now()-interval '15 minutes';
  if exists(select 1 from public.battle_rooms where (host_id=u or guest_id=u)
    and status in ('waiting','playing') and expires_at>now()) then
    return jsonb_build_object('error','ROOM_ALREADY_ACTIVE');
  end if;
  for n in 1..20 loop
    code_value:=lpad(floor(random()*1000000)::integer::text,6,'0');
    begin
      insert into public.battle_rooms(code,host_id,host_info,is_public)
        values(code_value,u,p_info,true) returning * into r;
      return to_jsonb(r);
    exception when unique_violation then null;
    end;
  end loop;
  return jsonb_build_object('error','RETRY');
end $$;

create or replace function public.balc_join_public_room(p_room uuid,p_info jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare r public.battle_rooms; u uuid:=balc_private.user_id();
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(u::text,0));
  if not balc_private.rate_limit() then return jsonb_build_object('error','RATE_LIMIT'); end if;
  if octet_length(p_info::text)>1024 or jsonb_typeof(p_info)<>'object' then raise exception 'INVALID_INFO'; end if;
  select * into r from public.battle_rooms where id=p_room and is_public=true
    and status='waiting' and guest_id is null and created_at>now()-interval '15 minutes'
    and expires_at>now() for update;
  if r.id is null or r.host_id=u then return jsonb_build_object('error','ROOM_NOT_FOUND'); end if;
  if exists(select 1 from public.battle_rooms where (host_id=u or guest_id=u)
    and status in ('waiting','playing') and expires_at>now()) then
    return jsonb_build_object('error','ROOM_ALREADY_ACTIVE');
  end if;
  update public.battle_rooms set guest_id=u,guest_info=p_info,status='playing',
    first_user=case when random()<0.5 then host_id else u end
    where id=r.id returning * into r;
  update public.battle_rooms set turn_user=first_user where id=r.id returning * into r;
  return to_jsonb(r);
end $$;

revoke all on function public.balc_list_public_rooms(),
  public.balc_create_public_room(jsonb),public.balc_join_public_room(uuid,jsonb) from public,anon;
grant execute on function public.balc_list_public_rooms(),
  public.balc_create_public_room(jsonb),public.balc_join_public_room(uuid,jsonb) to authenticated;

commit;
