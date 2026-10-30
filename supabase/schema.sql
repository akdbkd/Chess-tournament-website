-- Run once in a new Supabase project's SQL editor. Server-only mutations.
create extension if not exists pgcrypto;
create table public.profiles (id uuid primary key references auth.users on delete cascade, display_name text not null default 'Player', role text not null default 'USER' check(role in ('USER','ORGANIZER','ADMIN')), created_at timestamptz not null default now());
create function public.handle_new_user() returns trigger language plpgsql security definer set search_path=public as $$ begin insert into profiles(id,display_name) values(new.id,left(coalesce(new.raw_user_meta_data->>'display_name','Player'),80)); return new; end; $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();
create table public.tournaments (id uuid primary key default gen_random_uuid(), slug text unique not null, title text not null, description text not null, category text not null check(category in ('Rapid','Blitz','Bullet','Classical')), format text not null, time_control text not null, starts_at timestamptz not null, registration_closes timestamptz not null, capacity integer not null check(capacity>=2), participants integer not null default 0, fee_paise integer not null default 0 check(fee_paise>=0), prize_paise integer not null default 0, min_rating integer not null default 0, max_rating integer not null default 3000, min_account_days integer not null default 30, status text not null default 'draft' check(status in ('draft','open','closed','live','completed','archived')), organizer_id uuid references profiles, organizer_name text not null, chess_url text not null default '', auto_approve boolean not null default true, featured boolean not null default false, color text not null default 'orange', created_at timestamptz default now(), check(registration_closes<=starts_at),check(min_rating<=max_rating));
create table public.chess_players (id uuid primary key default gen_random_uuid(), username text not null, normalized_username text generated always as (lower(username)) stored unique, rating integer, joined bigint not null, country text, title text, last_synced_at timestamptz not null default now());
create table public.registrations (id uuid primary key default gen_random_uuid(), tournament_id uuid not null references tournaments on delete cascade, chess_player_id uuid not null references chess_players, registered_by uuid not null references profiles, username text not null, rating integer, status text not null check(status in ('pending_payment','pending','approved','rejected','waitlisted','withdrawn','checked_in')), payment_status text not null default 'unpaid' check(payment_status in ('unpaid','paid','free','refund_requested','refunded')), amount_paise integer not null, order_id text unique, payment_id text unique, expires_at timestamptz, checked_in_at timestamptz, created_at timestamptz not null default now(), unique(tournament_id,chess_player_id));
create index registration_owner_idx on registrations(registered_by);
create table public.payment_orders (order_id text primary key, registration_id uuid not null references registrations, tournament_id uuid not null references tournaments, user_id uuid not null references profiles, amount_paise integer not null, expires_at timestamptz not null, payment_id text unique, payment_status text not null default 'unpaid' check(payment_status in ('unpaid','paid','refund_requested','refunded')), created_at timestamptz not null default now());
create table public.saved_tournaments(user_id uuid references profiles on delete cascade,tournament_id uuid references tournaments on delete cascade,primary key(user_id,tournament_id));
create table public.notifications(id uuid primary key default gen_random_uuid(),user_id uuid not null references profiles on delete cascade,title text not null,body text not null,read boolean not null default false,created_at timestamptz not null default now());
create table public.posts(id uuid primary key default gen_random_uuid(),tournament_id uuid references tournaments on delete cascade,author_id uuid not null references profiles,author_name text not null,title text not null,body text not null,category text not null,likes integer not null default 0,locked boolean not null default false,hidden boolean not null default false,created_at timestamptz not null default now());
create table public.comments(id uuid primary key default gen_random_uuid(),post_id uuid not null references posts on delete cascade,author_id uuid not null references profiles,author_name text not null,body text not null,created_at timestamptz not null default now());
create table public.reactions(post_id uuid references posts on delete cascade,user_id uuid references profiles on delete cascade,primary key(post_id,user_id));
create table public.reports(id uuid primary key default gen_random_uuid(),post_id uuid not null references posts on delete cascade,user_id uuid not null references profiles,reason text not null,status text not null default 'open',created_at timestamptz default now(),unique(post_id,user_id));
create table public.standings(tournament_id uuid references tournaments on delete cascade,username text not null,score numeric not null default 0,wins integer not null default 0,draws integer not null default 0,losses integer not null default 0,tiebreak numeric not null default 0,primary key(tournament_id,username));
create table public.audit_logs(id uuid primary key default gen_random_uuid(),actor_id uuid references profiles,action text not null,entity_id text,details jsonb not null default '{}',created_at timestamptz default now());
create table public.rate_limits(key text primary key,hits integer not null,window_start timestamptz not null);
create table public.site_settings(id boolean primary key default true check(id),support_email text not null default '',community_enabled boolean not null default true);
insert into site_settings default values;
-- Enable RLS on every table. No client has write policies; all mutations go through authenticated API handlers.
do $$ declare t text; begin foreach t in array array['payment_orders','profiles','tournaments','chess_players','registrations','saved_tournaments','notifications','posts','comments','reactions','reports','standings','audit_logs','rate_limits','site_settings'] loop execute format('alter table public.%I enable row level security',t); end loop; end $$;
create policy profile_self on profiles for select to authenticated using(id=auth.uid());
create policy public_tournaments on tournaments for select using(status not in ('draft','archived') or organizer_id=auth.uid());
create policy own_payment_orders on payment_orders for select to authenticated using(user_id=auth.uid());
create policy own_registrations on registrations for select to authenticated using(registered_by=auth.uid());
create policy own_saves on saved_tournaments for select to authenticated using(user_id=auth.uid());
create policy own_notices on notifications for select to authenticated using(user_id=auth.uid());
create policy visible_posts on posts for select using(not hidden);
create policy visible_comments on comments for select using(exists(select 1 from posts where posts.id=post_id and not hidden));
create policy visible_standings on standings for select using(exists(select 1 from tournaments where tournaments.id=tournament_id and status not in ('draft','archived')));
create policy public_settings on site_settings for select using(true);
-- Atomic rate limiting survives serverless cold starts.
create function public.consume_rate_limit(p_key text,p_limit integer,p_seconds integer) returns boolean language plpgsql security definer set search_path=public as $$ declare n integer; begin insert into rate_limits(key,hits,window_start) values(p_key,1,now()) on conflict(key) do update set hits=case when rate_limits.window_start<now()-make_interval(secs=>p_seconds) then 1 else rate_limits.hits+1 end,window_start=case when rate_limits.window_start<now()-make_interval(secs=>p_seconds) then now() else rate_limits.window_start end returning hits into n; return n<=p_limit; end; $$;
-- Locks the tournament row: simultaneous requests cannot oversell capacity.
create function public.reserve_registration(p_tournament uuid,p_user uuid,p_player uuid,p_username text,p_rating integer) returns registrations language plpgsql security definer set search_path=public as $$
declare t tournaments; r registrations; n integer; p chess_players;
begin
 select * into t from tournaments where id=p_tournament for update;
 if not found then raise exception 'Tournament not found'; end if;
 if t.status<>'open' or now()>=t.registration_closes then raise exception 'Registration has closed'; end if;
 select * into p from chess_players where id=p_player;
 if not found or lower(p.username)<>lower(p_username) then raise exception 'Invalid player'; end if;
 if (p_rating is null and (t.min_rating>0 or t.max_rating<3000)) or p_rating<t.min_rating or p_rating>t.max_rating then raise exception 'Player rating is outside eligibility limits'; end if;
 if to_timestamp(p.joined)>now()-make_interval(days=>t.min_account_days) then raise exception 'Chess.com account is too new'; end if;
 update registrations set status='withdrawn' where tournament_id=p_tournament and status='pending_payment' and expires_at<now();
 select * into r from registrations where tournament_id=p_tournament and chess_player_id=p_player;
 if found and r.status not in ('withdrawn','rejected') then raise exception 'This player is already registered'; end if;
 if r.payment_status in ('paid','refund_requested') then raise exception 'Contact the organizer to resolve the previous paid entry'; end if;
 select count(*) into n from registrations where tournament_id=p_tournament and status in ('pending_payment','pending','approved','checked_in');
 if n>=t.capacity then raise exception 'This tournament is full'; end if;
 insert into registrations(tournament_id,chess_player_id,registered_by,username,rating,status,payment_status,amount_paise,expires_at)
 values(p_tournament,p_player,p_user,p_username,p_rating,case when t.fee_paise>0 then 'pending_payment' when t.auto_approve then 'approved' else 'pending' end,case when t.fee_paise=0 then 'free' else 'unpaid' end,t.fee_paise,case when t.fee_paise>0 then now()+interval '15 minutes' else null end)
 on conflict(tournament_id,chess_player_id) do update set registered_by=p_user,username=p_username,rating=p_rating,status=excluded.status,payment_status=excluded.payment_status,amount_paise=excluded.amount_paise,expires_at=excluded.expires_at,order_id=null,payment_id=null,created_at=now() returning * into r;
 update tournaments set participants=n+1 where id=p_tournament;
 if t.fee_paise=0 then insert into notifications(user_id,title,body) values(p_user,'Registration received',p_username||' registered for '||t.title); end if;
 return r;
end; $$;
-- Both the signed browser callback and webhook call the same idempotent transaction.
create function public.confirm_payment(p_order text,p_payment text,p_amount integer) returns jsonb language plpgsql security definer set search_path=public as $$
declare r registrations; t tournaments; o payment_orders;
begin
 select * into o from payment_orders where order_id=p_order;
 if not found then raise exception 'Unknown payment order'; end if;
 select * into t from tournaments where id=o.tournament_id for update;
 select * into o from payment_orders where order_id=p_order for update;
 select * into r from registrations where id=o.registration_id for update;
 if o.amount_paise<>p_amount then raise exception 'Payment amount mismatch'; end if;
 if o.payment_status in ('paid','refund_requested','refunded') then return jsonb_build_object('id',o.registration_id,'payment_status',o.payment_status,'status',case when r.order_id=p_order then r.status else 'withdrawn' end);end if;
 if r.order_id is distinct from p_order or r.status<>'pending_payment' or o.expires_at<now() or t.status<>'open' or now()>=t.registration_closes then
   update payment_orders set payment_id=p_payment,payment_status='refund_requested' where order_id=p_order;
   if r.order_id=p_order then update registrations set payment_id=p_payment,payment_status='refund_requested',status='withdrawn' where id=r.id returning * into r;end if;
   insert into notifications(user_id,title,body) values(o.user_id,'Payment needs a refund','Payment '||p_payment||' arrived after its reservation expired or was withdrawn. The organizer must refund it.');
   return jsonb_build_object('id',o.registration_id,'payment_status','refund_requested','status','withdrawn');
 end if;
 update payment_orders set payment_id=p_payment,payment_status='paid' where order_id=p_order;
 update registrations set payment_id=p_payment,payment_status='paid',status=case when t.auto_approve then 'approved' else 'pending' end,expires_at=null where id=r.id returning * into r;
 insert into notifications(user_id,title,body) values(o.user_id,'Payment confirmed',r.username||' is registered for '||t.title);
 update tournaments set participants=(select count(*) from registrations where tournament_id=t.id and status in ('pending','approved','checked_in','pending_payment')) where id=t.id;
 return to_jsonb(r);
end; $$;
create function public.toggle_reaction(p_post uuid,p_user uuid) returns integer language plpgsql security definer set search_path=public as $$ declare n integer; begin perform 1 from posts where id=p_post and not hidden for update; if not found then raise exception 'Post unavailable';end if; delete from reactions where post_id=p_post and user_id=p_user; if not found then insert into reactions values(p_post,p_user);end if;select count(*) into n from reactions where post_id=p_post;update posts set likes=n where id=p_post;return n;end;$$;
-- SECURITY DEFINER functions are never callable by public/anon/authenticated clients.
revoke all on function consume_rate_limit(text,integer,integer),reserve_registration(uuid,uuid,uuid,text,integer),confirm_payment(text,text,integer),toggle_reaction(uuid,uuid),handle_new_user() from public,anon,authenticated;
grant execute on function consume_rate_limit(text,integer,integer),reserve_registration(uuid,uuid,uuid,text,integer),confirm_payment(text,text,integer),toggle_reaction(uuid,uuid) to service_role;

create function public.transition_registration(p_id uuid,p_actor uuid,p_action text) returns registrations language plpgsql security definer set search_path=public as $$
declare r registrations; t tournaments; actor profiles;
begin
 select * into r from registrations where id=p_id;if not found then raise exception 'Registration not found';end if;
 select * into t from tournaments where id=r.tournament_id for update;
 select * into r from registrations where id=p_id for update;
 select * into actor from profiles where id=p_actor;
 if p_action in ('withdraw','checkin') then
   if r.registered_by<>p_actor then raise exception 'Not your registration';end if;
 else
   if (actor.role='ADMIN' or (actor.role='ORGANIZER' and t.organizer_id=p_actor)) is not true then raise exception 'Not authorized';end if;
 end if;
 if p_action='withdraw' then
   if now()>=t.starts_at or r.status not in ('pending_payment','pending','approved','waitlisted') then raise exception 'Entry cannot be withdrawn';end if;
   update registrations set status='withdrawn',payment_status=case when payment_status='paid' then 'refund_requested' else payment_status end where id=p_id returning * into r;
 elsif p_action='checkin' then
   if r.status<>'approved' or now()<t.starts_at-interval '30 minutes' or now()>=t.starts_at then raise exception 'Check-in is closed';end if;
   update registrations set status='checked_in',checked_in_at=now() where id=p_id returning * into r;
 elsif p_action='approve' then
   if r.status<>'pending' or r.payment_status not in ('paid','free') then raise exception 'Entry cannot be approved';end if;
   update registrations set status='approved' where id=p_id returning * into r;
 elsif p_action='reject' then
   if r.status not in ('approved','pending') then raise exception 'Entry cannot be rejected';end if;
   update registrations set status='rejected',payment_status=case when payment_status='paid' then 'refund_requested' else payment_status end where id=p_id returning * into r;
 else raise exception 'Invalid transition';end if;
 if r.payment_status='refund_requested' then update payment_orders set payment_status='refund_requested' where order_id=r.order_id and payment_status='paid';end if;
 update tournaments set participants=(select count(*) from registrations where tournament_id=t.id and (status in ('pending','approved','checked_in') or status='pending_payment' and expires_at>now())) where id=t.id;
 insert into audit_logs(actor_id,action,entity_id) values(p_actor,'registration.'||p_action,p_id::text);
 insert into notifications(user_id,title,body) values(r.registered_by,'Registration updated',r.username||': '||replace(r.status,'_',' '));
 return r;
end; $$;
revoke all on function transition_registration(uuid,uuid,text) from public,anon,authenticated;
grant execute on function transition_registration(uuid,uuid,text) to service_role;

-- Public API reads the effective count rather than stale/expired payment holds.
create view public.tournament_catalog as
 select t.*, (select count(*)::integer from registrations r where r.tournament_id=t.id and (r.status in ('approved','pending','checked_in') or r.status='pending_payment' and r.expires_at>now())) as active_participants from tournaments t;
revoke all on public.tournament_catalog from public,anon,authenticated;
grant select on public.tournament_catalog to service_role;

-- Safe to apply to an existing Knightfall database. Also included in schema.sql.
begin;
alter table public.profiles add column if not exists status text not null default 'active' check(status in ('active','suspended'));
alter table public.profiles add column if not exists suspension_reason text not null default '';
alter table public.registrations add column if not exists rules_accepted_at timestamptz;
alter table public.registrations add column if not exists policy_version text;
alter table public.tournaments add column if not exists updated_at timestamptz not null default now();
alter table public.tournaments drop constraint if exists tournaments_status_check;
alter table public.tournaments add constraint tournaments_status_check check(status in ('draft','open','closed','live','completed','archived','cancelled'));
alter table public.site_settings add column if not exists registrations_enabled boolean not null default true;
alter table public.site_settings add column if not exists announcement text not null default '';
alter table public.site_settings add column if not exists operator_name text not null default '';
alter table public.site_settings add column if not exists jurisdiction text not null default '';
alter table public.site_settings add column if not exists retention_days integer not null default 365 check(retention_days between 30 and 3650);
create index if not exists registrations_event_status_idx on registrations(tournament_id,status,expires_at);
create index if not exists posts_created_idx on posts(created_at desc);
create index if not exists comments_post_idx on comments(post_id,created_at);
create index if not exists notices_user_created_idx on notifications(user_id,created_at desc);
create index if not exists orders_refund_idx on payment_orders(tournament_id,payment_status);
create index if not exists audit_created_idx on audit_logs(created_at desc);
create table if not exists public.refund_requests (
  order_id text primary key references payment_orders,
  request_id uuid not null default gen_random_uuid(),
  state text not null default 'pending' check(state in ('pending','submitted','processed','failed')),
  provider_refund_id text unique,
  updated_at timestamptz not null default now()
);
alter table public.refund_requests enable row level security;

create or replace function public.reserve_registration(p_tournament uuid,p_user uuid,p_player uuid,p_username text,p_rating integer) returns registrations language plpgsql security definer set search_path=public as $$
declare t tournaments; r registrations; n integer; p chess_players;
begin
 if not exists(select 1 from profiles where id=p_user and status='active') then raise exception 'Account is suspended or unavailable';end if;
 select * into t from tournaments where id=p_tournament for update;
 if not found then raise exception 'Tournament not found'; end if;
 if t.status<>'open' or now()>=t.registration_closes then raise exception 'Registration has closed'; end if;
 select * into p from chess_players where id=p_player;
 if not found or lower(p.username)<>lower(p_username) then raise exception 'Invalid player'; end if;
 if (p_rating is null and (t.min_rating>0 or t.max_rating<3000)) or p_rating<t.min_rating or p_rating>t.max_rating then raise exception 'Player rating is outside eligibility limits'; end if;
 if to_timestamp(p.joined)>now()-make_interval(days=>t.min_account_days) then raise exception 'Chess.com account is too new'; end if;
 update registrations set status='withdrawn' where tournament_id=p_tournament and status='pending_payment' and expires_at<now();
 select * into r from registrations where tournament_id=p_tournament and chess_player_id=p_player;
 if found and r.status not in ('withdrawn','rejected') then raise exception 'This player is already registered'; end if;
 if r.payment_status in ('paid','refund_requested') then raise exception 'Contact the organizer to resolve the previous paid entry'; end if;
 select count(*) into n from registrations where tournament_id=p_tournament and status in ('pending_payment','pending','approved','checked_in');
 if n>=t.capacity then raise exception 'This tournament is full'; end if;
 insert into registrations(tournament_id,chess_player_id,registered_by,username,rating,status,payment_status,amount_paise,expires_at,rules_accepted_at,policy_version)
 values(p_tournament,p_player,p_user,p_username,p_rating,case when t.fee_paise>0 then 'pending_payment' when t.auto_approve then 'approved' else 'pending' end,case when t.fee_paise=0 then 'free' else 'unpaid' end,t.fee_paise,case when t.fee_paise>0 then now()+interval '15 minutes' else null end,now(),'2026-10-31')
 on conflict(tournament_id,chess_player_id) do update set registered_by=p_user,username=p_username,rating=p_rating,status=excluded.status,payment_status=excluded.payment_status,amount_paise=excluded.amount_paise,expires_at=excluded.expires_at,order_id=null,payment_id=null,checked_in_at=null,rules_accepted_at=now(),policy_version='2026-10-31',created_at=now() returning * into r;
 update tournaments set participants=n+1 where id=p_tournament;
 if t.fee_paise=0 then insert into notifications(user_id,title,body) values(p_user,'Registration received',p_username||' registered for '||t.title); end if;
 return r;
end; $$;

-- Account management and its audit record commit together. Serialize privilege
-- changes so there is no gap between checking authority and applying a change.
create or replace function public.manage_account(p_actor uuid,p_target uuid,p_role text,p_status text,p_reason text) returns void language plpgsql security definer set search_path=public as $$
declare actor profiles; target profiles;
begin
 perform pg_advisory_xact_lock(741947);
 select * into actor from profiles where id=p_actor for update;
 if (actor.role='ADMIN' and actor.status='active') is not true then raise exception using errcode='42501',message='Administrator access is required';end if;
 if p_actor=p_target then raise exception 'You cannot change your own access';end if;
 select * into target from profiles where id=p_target for update;
 if not found then raise exception 'Account not found';end if;
 if p_role is not null and p_role not in ('USER','ORGANIZER','ADMIN') then raise exception 'Invalid role';end if;
 if p_status is not null and p_status not in ('active','suspended') then raise exception 'Invalid account status';end if;
 if p_status='suspended' and length(trim(coalesce(p_reason,'')))<5 then raise exception 'Explain the reason for suspension';end if;
 update profiles set role=coalesce(p_role,role),status=coalesce(p_status,status),suspension_reason=case when p_status='suspended' then left(p_reason,500) when p_status='active' then '' else suspension_reason end where id=p_target;
 insert into audit_logs(actor_id,action,entity_id,details) values(p_actor,'user.access_changed',p_target::text,jsonb_build_object('previous_role',target.role,'role',coalesce(p_role,target.role),'previous_status',target.status,'status',coalesce(p_status,target.status),'reason',left(coalesce(p_reason,''),500)));
end;$$;

-- Database guards also protect calls made through the service role.
create or replace function public.guard_registration() returns trigger language plpgsql security definer set search_path=public as $$
begin
 if (select status from profiles where id=new.registered_by) is distinct from 'active' then raise exception 'Account is suspended or unavailable';end if;
 if new.status in ('approved','pending','pending_payment') and (select registrations_enabled from site_settings where id=true) is not true then raise exception 'New registrations are temporarily paused';end if;
 return new;
end;$$;
drop trigger if exists registration_account_guard on registrations;
create trigger registration_account_guard before insert on registrations for each row execute function guard_registration();

create or replace function public.save_tournament(p_actor uuid,p_id uuid,p_values jsonb,p_version timestamptz default null) returns tournaments language plpgsql security definer set search_path=public as $$
declare actor profiles; t tournaments; v tournaments; n integer; result tournaments;
begin
 select * into actor from profiles where id=p_actor;
 if (actor.status='active' and actor.role in ('ADMIN','ORGANIZER')) is not true then raise exception using errcode='42501',message='Organizer access is required';end if;
 v:=jsonb_populate_record(null::tournaments,p_values);
 if p_id is not null then
  select * into t from tournaments where id=p_id for update;
  if not found then raise exception 'Tournament not found';end if;
  if actor.role<>'ADMIN' and t.organizer_id<>p_actor then raise exception using errcode='42501',message='You can only manage your own tournaments';end if;
  if p_version is null or t.updated_at<>p_version then raise exception 'This event changed. Reload the studio before saving';end if;
  if t.status='completed' and v.status not in ('completed','archived') then raise exception 'Completed tournaments cannot reopen';end if;
  if t.status='archived' and v.status<>'archived' then raise exception 'Archived tournaments cannot reopen';end if;
  if t.status='live' and v.status not in ('live','completed') then raise exception 'Live events can only be completed or cancelled';end if;
  if t.status<>'draft' and v.status='draft' then raise exception 'Published events cannot return to draft';end if;
  if t.status='cancelled' and v.status not in ('cancelled','archived') then raise exception 'Cancelled tournaments cannot reopen';end if;
  select count(*) into n from registrations where tournament_id=p_id and (status in ('pending','approved','checked_in') or status='pending_payment' and expires_at>now());
  if v.capacity<n then raise exception 'Capacity cannot be below active registrations';end if;
  if t.fee_paise<>v.fee_paise and exists(select 1 from registrations where tournament_id=p_id) then raise exception 'Entry fee cannot change after registrations begin';end if;
  if n>0 and (t.category<>v.category or t.time_control<>v.time_control or t.min_rating<>v.min_rating or t.max_rating<>v.max_rating or t.min_account_days<>v.min_account_days) then raise exception 'Eligibility and time control cannot change with active entries';end if;
  if n>0 and t.status<>'completed' and v.status in ('draft','archived') then raise exception 'Cancel the event before hiding active registrations';end if;
 else
  if v.status not in ('draft','open') then raise exception 'New tournaments must start as draft or open';end if;
  t.id:=gen_random_uuid();t.organizer_id:=p_actor;t.organizer_name:=actor.display_name;
 end if;
 if v.status='cancelled' and (p_id is null or t.status<>'cancelled') then raise exception 'Use the cancellation action to notify players and queue refunds';end if;
 if v.status in ('open','live') and v.fee_paise>0 and not exists(select 1 from site_settings where id=true and length(trim(operator_name))>=2 and length(trim(jurisdiction))>=2 and support_email like '%@%') then raise exception 'Configure the legal operator and support contact before publishing paid events';end if;
 if v.status='live' and v.chess_url='' then raise exception 'Add a Chess.com lobby before marking an event live';end if;
 if v.status='open' and v.registration_closes<=now() and (p_id is null or t.status<>'open') then raise exception 'Registration deadline must be in the future when opening an event';end if;
 insert into tournaments(id,slug,title,description,category,format,time_control,starts_at,registration_closes,capacity,fee_paise,prize_paise,min_rating,max_rating,min_account_days,status,organizer_id,organizer_name,chess_url,auto_approve,featured,color,updated_at)
 values(t.id,v.slug,v.title,v.description,v.category,v.format,v.time_control,v.starts_at,v.registration_closes,v.capacity,v.fee_paise,v.prize_paise,v.min_rating,v.max_rating,v.min_account_days,v.status,t.organizer_id,t.organizer_name,v.chess_url,v.auto_approve,v.featured,v.color,clock_timestamp())
 on conflict(id) do update set slug=excluded.slug,title=excluded.title,description=excluded.description,category=excluded.category,format=excluded.format,time_control=excluded.time_control,starts_at=excluded.starts_at,registration_closes=excluded.registration_closes,capacity=excluded.capacity,fee_paise=excluded.fee_paise,prize_paise=excluded.prize_paise,min_rating=excluded.min_rating,max_rating=excluded.max_rating,min_account_days=excluded.min_account_days,status=excluded.status,chess_url=excluded.chess_url,auto_approve=excluded.auto_approve,featured=excluded.featured,color=excluded.color,updated_at=excluded.updated_at returning * into result;
 if p_id is not null and (t.starts_at<>v.starts_at or t.chess_url<>v.chess_url or t.status<>v.status) then
  insert into notifications(user_id,title,body) select distinct registered_by,'Tournament updated',v.title||': schedule, lobby or status changed. Review the event page.' from registrations where tournament_id=t.id and status in ('approved','pending','checked_in');
 end if;
 insert into audit_logs(actor_id,action,entity_id,details) values(p_actor,case when p_id is null then 'tournament.created' else 'tournament.updated' end,t.id::text,jsonb_build_object('status',v.status));
 return result;
end;$$;

create or replace function public.cancel_tournament(p_actor uuid,p_id uuid,p_reason text) returns void language plpgsql security definer set search_path=public as $$
declare t tournaments; actor profiles;
begin
 select * into actor from profiles where id=p_actor;
 select * into t from tournaments where id=p_id for update;
 if not found then raise exception 'Tournament not found';end if;
 if (actor.status='active' and (actor.role='ADMIN' or actor.role='ORGANIZER' and t.organizer_id=p_actor)) is not true then raise exception using errcode='42501',message='Not authorized';end if;
 if t.status='cancelled' then return;end if;
 if t.status in ('completed','archived') then raise exception 'This event cannot be cancelled';end if;
 if length(trim(p_reason))<5 then raise exception 'Give players a cancellation reason';end if;
 insert into notifications(user_id,title,body) select distinct registered_by,'Tournament cancelled',t.title||': '||left(p_reason,500)||'. Paid entries are queued for refund.' from registrations where tournament_id=p_id and status in ('approved','pending','pending_payment','checked_in','waitlisted');
 update registrations set status='withdrawn',payment_status=case when payment_status='paid' then 'refund_requested' else payment_status end where tournament_id=p_id and status in ('approved','pending','pending_payment','checked_in','waitlisted');
 update payment_orders set payment_status='refund_requested' where tournament_id=p_id and payment_status='paid';
 update tournaments set status='cancelled',participants=0,updated_at=clock_timestamp() where id=p_id;
 insert into audit_logs(actor_id,action,entity_id,details) values(p_actor,'tournament.cancelled',p_id::text,jsonb_build_object('reason',left(p_reason,500)));
end;$$;

-- An order and its registration link must never be committed independently.
create or replace function public.attach_payment_order(p_actor uuid,p_registration uuid,p_order text,p_expires timestamptz) returns registrations language plpgsql security definer set search_path=public as $$
declare r registrations; tid uuid;
begin
 select tournament_id into tid from registrations where id=p_registration;
 perform 1 from tournaments where id=tid for update;
 select * into r from registrations where id=p_registration for update;
 if r.registered_by is distinct from p_actor or r.status<>'pending_payment' or r.expires_at is distinct from p_expires or r.expires_at<=now() or r.order_id is not null then raise exception 'Payment reservation expired or changed. Register again';end if;
 insert into payment_orders(order_id,registration_id,tournament_id,user_id,amount_paise,expires_at) values(p_order,r.id,r.tournament_id,r.registered_by,r.amount_paise,r.expires_at);
 update registrations set order_id=p_order where id=r.id returning * into r;
 return r;
end;$$;

-- Claim before contacting Razorpay. The same stable provider idempotency key is
-- reused after a timeout; concurrent attempts cannot initiate two refunds.
create or replace function public.claim_refund(p_actor uuid,p_order text) returns jsonb language plpgsql security definer set search_path=public as $$
declare o payment_orders; actor profiles; t tournaments; r refund_requests;
begin
 select * into o from payment_orders where order_id=p_order;
 select * into t from tournaments where id=o.tournament_id for update;
 select * into actor from profiles where id=p_actor;
 if (actor.status='active' and (actor.role='ADMIN' or actor.role='ORGANIZER' and t.organizer_id=p_actor)) is not true then raise exception using errcode='42501',message='Not authorized';end if;
 select * into o from payment_orders where order_id=p_order for update;
 if o.payment_status<>'refund_requested' or o.payment_id is null then raise exception 'This payment is not awaiting refund';end if;
 select * into r from refund_requests where order_id=p_order for update;
 if found and r.state in ('submitted','processed') then return to_jsonb(r)||jsonb_build_object('claimed',false);end if;
 if found and r.state='pending' and r.updated_at>now()-interval '2 minutes' then raise exception 'A refund request is in progress. Wait two minutes before checking again';end if;
 insert into refund_requests(order_id) values(p_order) on conflict(order_id) do update set state='pending',request_id=case when refund_requests.state='failed' then gen_random_uuid() else refund_requests.request_id end,updated_at=now() returning * into r;
 insert into audit_logs(actor_id,action,entity_id) values(p_actor,'payment.refund_requested',p_order);
 return to_jsonb(r)||jsonb_build_object('claimed',true);
end;$$;

-- Refund delivery, entry state, counts and notification are one idempotent commit.
create or replace function public.process_refund(p_payment text,p_refund text,p_amount integer) returns boolean language plpgsql security definer set search_path=public as $$
declare o payment_orders;
begin
 select * into o from payment_orders where payment_id=p_payment;
 if not found then return false;end if;
 perform 1 from tournaments where id=o.tournament_id for update;
 select * into o from payment_orders where payment_id=p_payment for update;
 if o.amount_paise<>p_amount then raise exception 'Refund amount mismatch';end if;
 if o.payment_status='refunded' then return true;end if;
 update payment_orders set payment_status='refunded' where order_id=o.order_id;
 update registrations set payment_status='refunded',status='withdrawn' where payment_id=p_payment;
 insert into refund_requests(order_id,state,provider_refund_id) values(o.order_id,'processed',p_refund) on conflict(order_id) do update set state='processed',provider_refund_id=p_refund,updated_at=now();
 update tournaments set participants=(select count(*) from registrations where tournament_id=o.tournament_id and (status in ('approved','pending','checked_in') or status='pending_payment' and expires_at>now())) where id=o.tournament_id;
 insert into notifications(user_id,title,body) values(o.user_id,'Refund processed','Your full refund for payment '||p_payment||' has been processed. Bank settlement times vary.');
 insert into audit_logs(action,entity_id,details) values('payment.refunded',o.order_id,jsonb_build_object('refund_id',p_refund,'amount_paise',p_amount));
 return true;
end;$$;

create or replace function public.moderate_content(p_actor uuid,p_id uuid,p_action text) returns void language plpgsql security definer set search_path=public as $$
begin
 if not exists(select 1 from profiles where id=p_actor and role='ADMIN' and status='active') then raise exception using errcode='42501',message='Not authorized';end if;
 if p_action in ('hide','restore','lock','unlock') then update posts set hidden=case when p_action='hide' then true when p_action='restore' then false else hidden end,locked=case when p_action='lock' then true when p_action='unlock' then false else locked end where id=p_id;
 elsif p_action='delete_comment' then delete from comments where id=p_id;
 elsif p_action='resolve_report' then update reports set status='resolved' where id=p_id;
 else raise exception 'Invalid moderation action';end if;
 if not found then raise exception 'Content not found';end if;
 insert into audit_logs(actor_id,action,entity_id) values(p_actor,'community.'||p_action,p_id::text);
end;$$;

create or replace function public.save_site_settings(p_actor uuid,p_values jsonb) returns void language plpgsql security definer set search_path=public as $$
begin
 if not exists(select 1 from profiles where id=p_actor and role='ADMIN' and status='active') then raise exception using errcode='42501',message='Not authorized';end if;
 update site_settings set support_email=p_values->>'support_email',community_enabled=(p_values->>'community_enabled')::boolean,registrations_enabled=(p_values->>'registrations_enabled')::boolean,announcement=p_values->>'announcement',operator_name=p_values->>'operator_name',jurisdiction=p_values->>'jurisdiction',retention_days=(p_values->>'retention_days')::integer where id=true;
 insert into audit_logs(actor_id,action,entity_id,details) values(p_actor,'settings.updated','site',p_values);
end;$$;

-- A paused community must also reject replies/reactions (not just new threads).
create or replace function public.guard_community() returns trigger language plpgsql security definer set search_path=public as $$
begin
 if (select community_enabled from site_settings where id=true) is not true then raise exception 'Community posting is temporarily paused';end if;
 return new;
end;$$;
drop trigger if exists community_comment_guard on comments;
create trigger community_comment_guard before insert on comments for each row execute function guard_community();
drop trigger if exists community_post_guard on posts;
create trigger community_post_guard before insert on posts for each row execute function guard_community();
drop trigger if exists community_reaction_guard on reactions;
create trigger community_reaction_guard before insert on reactions for each row execute function guard_community();

revoke all on function manage_account(uuid,uuid,text,text,text),guard_registration(),save_tournament(uuid,uuid,jsonb,timestamptz),cancel_tournament(uuid,uuid,text),attach_payment_order(uuid,uuid,text,timestamptz),claim_refund(uuid,text),process_refund(text,text,integer),moderate_content(uuid,uuid,text),save_site_settings(uuid,jsonb),guard_community() from public,anon,authenticated;
grant execute on function manage_account(uuid,uuid,text,text,text),save_tournament(uuid,uuid,jsonb,timestamptz),cancel_tournament(uuid,uuid,text),attach_payment_order(uuid,uuid,text,timestamptz),claim_refund(uuid,text),process_refund(text,text,integer),moderate_content(uuid,uuid,text),save_site_settings(uuid,jsonb) to service_role;
drop policy if exists public_tournaments on tournaments;
create policy public_tournaments on tournaments for select using(status not in ('draft','archived') or (organizer_id=auth.uid() and exists(select 1 from profiles where id=auth.uid() and status='active')));
drop policy if exists profile_self on profiles;
create policy profile_self on profiles for select to authenticated using(id=auth.uid() and status='active');
do $$ declare t text; begin foreach t in array array['payment_orders','registrations','saved_tournaments','notifications'] loop
 execute format('drop policy if exists active_account on public.%I',t);
 execute format('create policy active_account on public.%I as restrictive for select to authenticated using(exists(select 1 from public.profiles where id=auth.uid() and status=''active''))',t);
end loop;end;$$;
-- Server-only scheduled maintenance; configure an authenticated scheduler.
create table if not exists public.event_reminders (
 user_id uuid references profiles on delete cascade,
 tournament_id uuid references tournaments on delete cascade,
 kind text check(kind in ('day_before','checkin')),
 created_at timestamptz not null default now(),
 primary key(user_id,tournament_id,kind)
);
alter table public.event_reminders enable row level security;
create or replace function public.run_maintenance() returns jsonb language plpgsql security definer set search_path=public as $$
declare locked_event tournaments; expired integer:=0; n integer; sent integer:=0;
begin
 -- Match the reservation/payment lock order to avoid deadlocks.
 for locked_event in select * from tournaments where status not in ('draft','archived','completed','cancelled') order by id for update skip locked loop
  update registrations set status='withdrawn' where tournament_id=locked_event.id and status='pending_payment' and expires_at<=now();
  get diagnostics n=row_count;expired:=expired+n;
  update tournaments set participants=(select count(*) from registrations where tournament_id=locked_event.id and status in ('pending','approved','checked_in','pending_payment')) where id=locked_event.id;
 end loop;
 with recipients as (
  select distinct r.registered_by as user_id,t.id as tournament_id,case when t.starts_at>now()+interval '30 minutes' then 'day_before' else 'checkin' end as kind
  from registrations r join tournaments t on t.id=r.tournament_id join profiles p on p.id=r.registered_by
  where t.status in ('open','closed') and t.starts_at>now() and t.starts_at<=now()+interval '24 hours' and r.status='approved' and p.status='active'
 ), added as (
  insert into event_reminders(user_id,tournament_id,kind) select user_id,tournament_id,kind from recipients on conflict do nothing returning *
 ) insert into notifications(user_id,title,body) select a.user_id,case when a.kind='checkin' then 'Check-in is open' else 'Your tournament starts within 24 hours' end,t.title||': review your dashboard for the schedule and Chess.com lobby.' from added a join tournaments t on t.id=a.tournament_id;
 get diagnostics sent=row_count;
 delete from rate_limits where window_start<now()-interval '1 day';
 return jsonb_build_object('expired_reservations',expired,'reminders_sent',sent);
end;$$;
revoke all on function run_maintenance() from public,anon,authenticated;
grant execute on function run_maintenance() to service_role;

create or replace function public.admin_summary(p_actor uuid) returns jsonb language plpgsql security definer set search_path=public as $$
declare actor profiles; result jsonb;
begin
 select * into actor from profiles where id=p_actor;
 if (actor.status='active' and actor.role in ('ADMIN','ORGANIZER')) is not true then raise exception using errcode='42501',message='Not authorized';end if;
 select jsonb_build_object('tournaments',(select count(*) from tournaments t where actor.role='ADMIN' or t.organizer_id=p_actor),'registrations',count(*),'collected_paise',coalesce(sum(r.amount_paise) filter(where r.payment_status='paid'),0)) into result from registrations r join tournaments t on t.id=r.tournament_id where actor.role='ADMIN' or t.organizer_id=p_actor;
 return result;
end;$$;
revoke all on function admin_summary(uuid) from public,anon,authenticated;
grant execute on function admin_summary(uuid) to service_role;

create or replace function public.import_standings(p_actor uuid,p_tournament uuid,p_rows jsonb) returns integer language plpgsql security definer set search_path=public as $$
declare actor profiles; t tournaments; n integer;
begin
 select * into actor from profiles where id=p_actor;
 select * into t from tournaments where id=p_tournament for update;
 if (actor.status='active' and (actor.role='ADMIN' or actor.role='ORGANIZER' and t.organizer_id=p_actor)) is not true then raise exception using errcode='42501',message='Not authorized';end if;
 if t.status not in ('closed','live','completed') then raise exception 'Close registration before importing reviewed standings';end if;
 if jsonb_typeof(p_rows)<>'array' or jsonb_array_length(p_rows) not between 1 and 10000 then raise exception 'Import between 1 and 10000 players';end if;
 if exists(select 1 from jsonb_to_recordset(p_rows) as x(username text) where not exists(select 1 from registrations r where r.tournament_id=p_tournament and lower(r.username)=lower(x.username) and r.status in ('approved','checked_in'))) then raise exception 'Standings may only include approved tournament players';end if;
 delete from standings s where s.tournament_id=p_tournament and lower(s.username) in (select lower(x.username) from jsonb_to_recordset(p_rows) as x(username text));
 insert into standings(tournament_id,username,score,wins,draws,losses,tiebreak) select p_tournament,lower(x.username),x.score,x.wins,x.draws,x.losses,x.tiebreak from jsonb_to_recordset(p_rows) as x(username text,score numeric,wins integer,draws integer,losses integer,tiebreak numeric);
 get diagnostics n=row_count;
 insert into audit_logs(actor_id,action,entity_id,details) values(p_actor,'standings.imported',p_tournament::text,jsonb_build_object('rows',n));
 return n;
end;$$;
revoke all on function import_standings(uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function import_standings(uuid,uuid,jsonb) to service_role;
commit;
