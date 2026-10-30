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
