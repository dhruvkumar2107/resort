-- ============================================================================
-- Akshaya Milan — 0001_initial.sql
-- Tables, indexes, Row Level Security, helper functions.
-- Run in the Supabase SQL editor (or via `supabase db push`).
-- ============================================================================

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- Table A: enquiries
-- ---------------------------------------------------------------------------
create table public.enquiries (
  id                 uuid primary key default gen_random_uuid(),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  full_name          text not null,
  phone              text not null,
  email              text,
  event_type         text,
  event_date         date,
  guest_count        integer check (guest_count >= 1 and guest_count <= 99999),
  message            text,
  lead_source        text not null default 'website',
  status             text not null default 'new'
                     check (status in
                       ('new','contacted','follow_up','site_visit_scheduled','converted','lost')),
  assigned_to        uuid references auth.users (id) on delete set null,
  internal_notes     text,
  consented_to_contact boolean not null default false,
  submitted_from     text,
  request_time_ms    integer,               -- client-reported time on page (anti-bot signal)
  services           text[],
  range              text,                  -- preferred space
  time               text,                  -- preferred time of day
  dedupe_key         text                   -- sha256(phone|message) de-duplication guard
);

alter table public.enquiries
  add constraint enquiries_dedupe_key_uniq unique (dedupe_key);
create index if not exists enquiries_created_at_idx on public.enquiries (created_at desc);
create index if not exists enquiries_status_idx on public.enquiries (status);
create index if not exists enquiries_phone_idx on public.enquiries (phone);
create index if not exists enquiries_event_type_idx on public.enquiries (event_type);

-- ---------------------------------------------------------------------------
-- Table B: visitor_sessions (pseudonymous, no PII, no IP, no fingerprints)
-- ---------------------------------------------------------------------------
create table public.visitor_sessions (
  id                    uuid primary key default gen_random_uuid(),
  session_id            text not null,
  first_seen_at         timestamptz not null default now(),
  last_seen_at          timestamptz not null default now(),
  landing_page          text not null,
  referrer_domain       text,
  device_category       text check (device_category in ('desktop','mobile','tablet')),
  browser_category      text,
  operating_system_category text,
  country_or_region     text,
  consent_status        text not null default 'declined'
                        check (consent_status in ('accepted','declined','withdrawn')),
  analytics_source      text not null default 'server-derived'
);

create unique index if not exists visitor_sessions_session_id_idx
  on public.visitor_sessions (session_id);
create index if not exists visitor_sessions_first_seen_idx
  on public.visitor_sessions (first_seen_at);
create index if not exists visitor_sessions_landing_idx
  on public.visitor_sessions (landing_page);

-- ---------------------------------------------------------------------------
-- Table C: page_views
-- ---------------------------------------------------------------------------
create table public.page_views (
  id                        uuid primary key default gen_random_uuid(),
  session_id                text not null,
  page_path                 text not null,
  viewed_at                 timestamptz not null default now(),
  referrer_domain           text,
  engagement_duration_seconds integer
);

create index if not exists page_views_session_id_idx on public.page_views (session_id);
create index if not exists page_views_viewed_at_idx on public.page_views (viewed_at);
create index if not exists page_views_path_idx on public.page_views (page_path);

-- ---------------------------------------------------------------------------
-- Table D: admin_users
-- ---------------------------------------------------------------------------
create table public.admin_users (
  id             uuid primary key default gen_random_uuid(),
  auth_user_id   uuid not null unique references auth.users (id) on delete cascade,
  display_name   text not null,
  role           text not null default 'staff' check (role in ('owner','staff')),
  is_active      boolean not null default true,
  created_at     timestamptz not null default now()
);

-- Privilege-escalation guard: only an owner can grant/demote the owner role
-- or deactivate an owner.
create or replace function public.prevent_admin_escalation()
returns trigger
language plpgsql security definer set search_path = public as
$$
begin
  if (tg_op = 'UPDATE') then
    if (old.role <> 'owner' and new.role = 'owner') and not public.is_owner() then
      raise exception 'only an owner can grant the owner role';
    end if;
    if (old.role = 'owner' and new.role <> 'owner') and not public.is_owner() then
      raise exception 'only an owner can demote an owner';
    end if;
    if (old.role = 'owner' and old.is_active = true and new.is_active = false) and not public.is_owner() then
      raise exception 'only an owner can deactivate an owner';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_admin_users_guard on public.admin_users;
create trigger trg_admin_users_guard
  before insert or update on public.admin_users
  for each row execute function public.prevent_admin_escalation();

-- ---------------------------------------------------------------------------
-- Auxiliary: transient anti-spam counters (hashed only; purged on expiry)
-- ---------------------------------------------------------------------------
create table public.submission_rate_limits (
  id         uuid primary key default gen_random_uuid(),
  key_hash   text not null,
  bucket     timestamptz not null default now(),
  method     text not null default 'enquiry',
  expires_at timestamptz not null default now() + interval '1 hour'
);

create index if not exists submission_rate_limits_key_bucket_idx
  on public.submission_rate_limits (key_hash, bucket);
create index if not exists submission_rate_limits_expires_idx
  on public.submission_rate_limits (expires_at);

-- ---------------------------------------------------------------------------
-- Auxiliary: status history and admin audit log
-- ---------------------------------------------------------------------------
create table public.enquiry_status_history (
  id         uuid primary key default gen_random_uuid(),
  enquiry_id uuid not null references public.enquiries (id) on delete cascade,
  from_status text,
  to_status   text not null,
  note        text,
  changed_by  uuid references public.admin_users (id) on delete set null,
  changed_at  timestamptz not null default now()
);

create index if not exists enquiry_status_history_enq_idx
  on public.enquiry_status_history (enquiry_id);

create table public.admin_audit_log (
  id          uuid primary key default gen_random_uuid(),
  admin_id    uuid references public.admin_users (id) on delete set null,
  action      text not null,
  entity_type text,
  entity_id   text,
  detail      jsonb,
  created_at  timestamptz not null default now()
);

create index if not exists admin_audit_log_created_at_idx
  on public.admin_audit_log (created_at desc);

-- ---------------------------------------------------------------------------
-- Helpers: current admin identity checks. Placed after admin_users is created
-- because these are LANGUAGE sql functions (the body is validated eagerly).
-- SECURITY DEFINER bypasses RLS of admin_users so policies can evaluate
-- against it without recursion.
-- ---------------------------------------------------------------------------
create or replace function public.is_admin()
returns boolean
language sql stable security definer set search_path = public as
$$
  select exists (
    select 1 from public.admin_users a
    where a.auth_user_id = auth.uid()
      and a.is_active = true
  );
$$;

create or replace function public.is_owner()
returns boolean
language sql stable security definer set search_path = public as
$$
  select exists (
    select 1 from public.admin_users a
    where a.auth_user_id = auth.uid()
      and a.role = 'owner'
      and a.is_active = true
  );
$$;

-- ============================================================================
-- Row Level Security
-- ============================================================================
alter table public.enquiries             enable row level security;
alter table public.visitor_sessions      enable row level security;
alter table public.page_views            enable row level security;
alter table public.admin_users           enable row level security;
alter table public.submission_rate_limits enable row level security;
alter table public.enquiry_status_history enable row level security;
alter table public.admin_audit_log       enable row level security;

-- Public enquiries are created by the validated server-side API (service role),
-- never directly by clients with the anon key. Anonymous users therefore have
-- no policies on any table => every direct anon access is denied.

-- enquiries
drop policy if exists "enquiries admin select" on public.enquiries;
create policy "enquiries admin select" on public.enquiries
  for select to authenticated using (public.is_admin());

drop policy if exists "enquiries admin update" on public.enquiries;
create policy "enquiries admin update" on public.enquiries
  for update to authenticated using (public.is_admin());

-- visitor_sessions
drop policy if exists "sessions admin select" on public.visitor_sessions;
create policy "sessions admin select" on public.visitor_sessions
  for select to authenticated using (public.is_admin());

-- page_views
drop policy if exists "pageviews admin select" on public.page_views;
create policy "pageviews admin select" on public.page_views
  for select to authenticated using (public.is_admin());

-- admin_users (read for admins; role changes further guarded by the trigger)
drop policy if exists "admin_users admin select" on public.admin_users;
create policy "admin_users admin select" on public.admin_users
  for select to authenticated using (public.is_admin());

-- enquiry_status_history (read for admins; writes via service-role API)
drop policy if exists "history admin select" on public.enquiry_status_history;
create policy "history admin select" on public.enquiry_status_history
  for select to authenticated using (public.is_admin());

-- admin_audit_log (read for admins; writes via service-role API)
drop policy if exists "audit admin select" on public.admin_audit_log;
create policy "audit admin select" on public.admin_audit_log
  for select to authenticated using (public.is_admin());