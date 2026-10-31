-- Apply after 20261031000000_production_hardening.sql. Existing users must sign in
-- again through the application once; old tokens cannot register themselves.
begin;
alter table public.site_settings add column if not exists login_enabled boolean not null default true;
alter table public.site_settings add column if not exists signup_enabled boolean not null default true;
alter table public.site_settings add column if not exists email_login_enabled boolean not null default true;
alter table public.site_settings add column if not exists google_login_enabled boolean not null default false;
alter table public.site_settings add column if not exists microsoft_login_enabled boolean not null default false;
alter table public.site_settings add column if not exists discord_login_enabled boolean not null default false;

create table if not exists public.auth_login_sessions (
 session_id uuid primary key, user_id uuid not null references profiles on delete cascade,
 provider text not null check(provider in ('email','google','azure','discord')),
 created_at timestamptz not null default now()
);
create index if not exists auth_login_user_idx on auth_login_sessions(user_id);
alter table public.auth_login_sessions enable row level security;
create table if not exists public.auth_handoffs (
 token_hash text primary key, payload text not null, expires_at timestamptz not null
);
alter table public.auth_handoffs enable row level security;

create or replace function public.authorize_login_session(p_session uuid,p_user uuid,p_provider text) returns void language plpgsql security definer set search_path=public as $$
declare s site_settings;
begin
 select * into s from site_settings where id=true for share;
 if not s.login_enabled then raise exception 'New sign-ins are temporarily paused';end if;
 if (case p_provider when 'email' then s.email_login_enabled when 'google' then s.google_login_enabled when 'azure' then s.microsoft_login_enabled when 'discord' then s.discord_login_enabled else false end) is not true then raise exception 'This sign-in method is disabled';end if;
 if not exists(select 1 from profiles where id=p_user and status='active') then raise exception 'Account is suspended or unavailable';end if;
 insert into auth_login_sessions(session_id,user_id,provider) values(p_session,p_user,p_provider)
 on conflict(session_id) do nothing;
 if not exists(select 1 from auth_login_sessions where session_id=p_session and user_id=p_user and provider=p_provider) then raise exception 'Session already belongs to another sign-in';end if;
end;$$;

-- Bind direct private reads to the same server-authorized session as the API.
-- Never infer the provider from editable user metadata or a browser argument.
create or replace function public.registered_login_session() returns boolean language sql stable security definer set search_path=public as $$
 select exists(select 1 from auth_login_sessions where user_id=auth.uid() and session_id::text=coalesce(nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'session_id',''))
$$;
revoke all on function registered_login_session() from public;
grant execute on function registered_login_session() to anon,authenticated,service_role;
drop policy if exists profile_self on profiles;
create policy profile_self on profiles for select to authenticated using(id=auth.uid() and status='active' and registered_login_session());
drop policy if exists public_tournaments on tournaments;
create policy public_tournaments on tournaments for select using(status not in ('draft','archived') or (organizer_id=auth.uid() and registered_login_session() and exists(select 1 from profiles where id=auth.uid() and status='active')));
do $$ declare t text;begin foreach t in array array['payment_orders','registrations','saved_tournaments','notifications'] loop
 execute format('drop policy if exists active_account on public.%I',t);
 execute format('create policy active_account on public.%I as restrictive for select to authenticated using(registered_login_session() and exists(select 1 from profiles where id=auth.uid() and status=''active''))',t);
end loop;end;$$;

create or replace function public.consume_auth_handoff(p_hash text) returns text language plpgsql security definer set search_path=public as $$
declare result text;
begin
 delete from auth_handoffs where token_hash=p_hash and expires_at>now() returning payload into result;
 return result;
end;$$;

-- GoTrue creates profiles in the same transaction as auth.users. Enforce new
-- account switches here too, including direct calls to the public Auth API.
create or replace function public.handle_new_user() returns trigger language plpgsql security definer set search_path=public as $$
declare s site_settings; provider text;
begin
 select * into s from site_settings where id=true for share;
 provider:=coalesce(to_jsonb(new)->'raw_app_meta_data'->>'provider','email');
 if not s.login_enabled or not s.signup_enabled then raise exception 'New accounts are temporarily paused';end if;
 if (case provider when 'email' then s.email_login_enabled when 'google' then s.google_login_enabled when 'azure' then s.microsoft_login_enabled when 'discord' then s.discord_login_enabled else false end) is not true then raise exception 'This sign-in method is disabled';end if;
 insert into profiles(id,display_name) values(new.id,left(coalesce(new.raw_user_meta_data->>'display_name',new.raw_user_meta_data->>'full_name',new.raw_user_meta_data->>'name','Player'),80));
 return new;
end;$$;

create or replace function public.save_site_settings(p_actor uuid,p_values jsonb) returns void language plpgsql security definer set search_path=public as $$
begin
 if not exists(select 1 from profiles where id=p_actor and role='ADMIN' and status='active') then raise exception using errcode='42501',message='Not authorized';end if;
 update site_settings set support_email=p_values->>'support_email',community_enabled=(p_values->>'community_enabled')::boolean,registrations_enabled=(p_values->>'registrations_enabled')::boolean,announcement=p_values->>'announcement',operator_name=p_values->>'operator_name',jurisdiction=p_values->>'jurisdiction',retention_days=(p_values->>'retention_days')::integer where id=true;
 insert into audit_logs(actor_id,action,entity_id,details) values(p_actor,'settings.updated','site',p_values);
end;$$;
create or replace function public.save_auth_settings(p_actor uuid,p_values jsonb) returns void language plpgsql security definer set search_path=public as $$
begin
 if not exists(select 1 from profiles where id=p_actor and role='ADMIN' and status='active') then raise exception using errcode='42501',message='Not authorized';end if;
 if (p_values->>'login_enabled')::boolean and not ((p_values->>'email_login_enabled')::boolean or (p_values->>'google_login_enabled')::boolean or (p_values->>'microsoft_login_enabled')::boolean or (p_values->>'discord_login_enabled')::boolean) then raise exception 'Enable a sign-in method or pause all new sign-ins';end if;
 update site_settings set login_enabled=(p_values->>'login_enabled')::boolean,signup_enabled=(p_values->>'signup_enabled')::boolean,email_login_enabled=(p_values->>'email_login_enabled')::boolean,google_login_enabled=(p_values->>'google_login_enabled')::boolean,microsoft_login_enabled=(p_values->>'microsoft_login_enabled')::boolean,discord_login_enabled=(p_values->>'discord_login_enabled')::boolean where id=true;
 insert into audit_logs(actor_id,action,entity_id,details) values(p_actor,'auth.settings_updated','site',p_values);
end;$$;
revoke all on function save_auth_settings(uuid,jsonb) from public,anon,authenticated;
grant execute on function save_auth_settings(uuid,jsonb) to service_role;
revoke all on function authorize_login_session(uuid,uuid,text),consume_auth_handoff(text),handle_new_user(),save_site_settings(uuid,jsonb) from public,anon,authenticated;
grant execute on function authorize_login_session(uuid,uuid,text),consume_auth_handoff(text),save_site_settings(uuid,jsonb) to service_role;
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
 delete from auth_handoffs where expires_at<now();
 if to_regclass('auth.sessions') is not null then execute 'delete from public.auth_login_sessions s where not exists(select 1 from auth.sessions a where a.id=s.session_id)';end if;
 delete from rate_limits where window_start<now()-interval '1 day';
 return jsonb_build_object('expired_reservations',expired,'reminders_sent',sent);
end;$$;

commit;
