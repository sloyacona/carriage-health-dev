-- Phase 1 initial schema
-- All patient-related data is PHI. Handle accordingly.
-- Run this in the Supabase SQL editor for your project.

-- UUID generation
create extension if not exists "pgcrypto";

-- ─────────────────────────────────────────────
-- Core tables
-- ─────────────────────────────────────────────

-- One row per patient account
create table if not exists members (
  id         uuid primary key default gen_random_uuid(),
  auth_id    text not null unique,  -- maps to auth.users.id from Supabase Auth
  email      text not null unique,  -- for login/contact only; never sent to Junction
  created_at timestamptz not null default now()
);

-- Junction user mapping.
-- client_user_id is an opaque UUID — must never contain PII (guardrail #6).
create table if not exists junction_users (
  id                uuid primary key default gen_random_uuid(),
  member_id         uuid not null references members(id) on delete restrict,
  junction_user_id  text not null unique,
  client_user_id    text not null unique,
  created_at        timestamptz not null default now()
);

-- Consent records; one row per consent event; versions are tracked.
create table if not exists consents (
  id           uuid primary key default gen_random_uuid(),
  member_id    uuid not null references members(id) on delete restrict,
  consent_type text not null check (
    consent_type in (
      'hipaa-authorization',
      'terms-of-use',
      'telehealth-informed-consent'
    )
  ),
  version      text not null,
  accepted_at  timestamptz not null default now(),
  ip_address   inet
);

-- Orders. Status tracks the patient through the full lifecycle.
create table if not exists orders (
  id                 uuid primary key default gen_random_uuid(),
  member_id          uuid not null references members(id) on delete restrict,
  junction_order_id  text unique,
  lab_test_id        text,
  status             text not null default 'payment_pending' check (
    status in (
      'payment_pending',
      'intake_pending',
      'order_placed',
      'requisition_ready',
      'appointment_scheduled',
      'specimen_collected',
      'results_pending',
      'results_ready',
      'results_concerning',
      'cancelled'
    )
  ),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

-- Payment records; amount in cents.
create table if not exists payments (
  id                        uuid primary key default gen_random_uuid(),
  member_id                 uuid not null references members(id) on delete restrict,
  order_id                  uuid not null references orders(id) on delete restrict,
  stripe_payment_intent_id  text not null unique,
  amount                    integer not null,
  status                    text not null,
  created_at                timestamptz not null default now()
);

-- Quest PSC appointment records.
create table if not exists appointments (
  id                       uuid primary key default gen_random_uuid(),
  order_id                 uuid not null references orders(id) on delete restrict,
  junction_appointment_id  text not null unique,
  psc_location             text not null,
  scheduled_for            timestamptz not null,
  status                   text not null default 'scheduled',
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);

-- Results: pointer to Junction data only.
-- Whether to cache result values locally is deferred to Phase 6 [DECISION — human].
create table if not exists results (
  id                 uuid primary key default gen_random_uuid(),
  order_id           uuid not null unique references orders(id) on delete restrict,
  status             text not null default 'pending' check (
    status in ('pending', 'ready', 'concerning')
  ),
  junction_result_id text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

-- ─────────────────────────────────────────────
-- Audit log (guardrail #4)
-- Append-only. No foreign key on member_id so the log survives member deletion.
-- No RLS — only the service-role key may read or write it.
-- ─────────────────────────────────────────────

create table if not exists audit_log (
  id         uuid primary key default gen_random_uuid(),
  actor      text        not null,  -- member_id, 'system', or 'webhook'
  action     text        not null,
  resource   text        not null,
  member_id  uuid,                  -- nullable: system/webhook actions may lack a member
  ip_address inet,
  created_at timestamptz not null default now()
);

-- Prevent DELETE and UPDATE on audit_log to keep it append-only.
create or replace rule audit_log_no_delete as
  on delete to audit_log do instead nothing;

create or replace rule audit_log_no_update as
  on update to audit_log do instead nothing;

-- ─────────────────────────────────────────────
-- updated_at auto-maintenance
-- ─────────────────────────────────────────────

create or replace function update_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger orders_updated_at
  before update on orders
  for each row execute function update_updated_at();

create trigger appointments_updated_at
  before update on appointments
  for each row execute function update_updated_at();

create trigger results_updated_at
  before update on results
  for each row execute function update_updated_at();

-- ─────────────────────────────────────────────
-- Row-Level Security (guardrail #5)
-- Members can only read/write their own rows.
-- Webhook/server code uses the service-role key and bypasses RLS by design.
-- ─────────────────────────────────────────────

alter table members        enable row level security;
alter table junction_users enable row level security;
alter table consents       enable row level security;
alter table orders         enable row level security;
alter table payments       enable row level security;
alter table appointments   enable row level security;
alter table results        enable row level security;
-- audit_log: RLS intentionally NOT enabled — service-role only

create policy "members: own row only"
  on members for all
  using (auth_id = auth.uid()::text);

create policy "junction_users: own rows only"
  on junction_users for all
  using (
    member_id = (select id from members where auth_id = auth.uid()::text)
  );

create policy "consents: own rows only"
  on consents for all
  using (
    member_id = (select id from members where auth_id = auth.uid()::text)
  );

create policy "orders: own rows only"
  on orders for all
  using (
    member_id = (select id from members where auth_id = auth.uid()::text)
  );

create policy "payments: own rows only"
  on payments for all
  using (
    member_id = (select id from members where auth_id = auth.uid()::text)
  );

create policy "appointments: own rows only"
  on appointments for all
  using (
    order_id in (
      select id from orders
      where member_id = (select id from members where auth_id = auth.uid()::text)
    )
  );

create policy "results: own rows only"
  on results for all
  using (
    order_id in (
      select id from orders
      where member_id = (select id from members where auth_id = auth.uid()::text)
    )
  );

-- ─────────────────────────────────────────────
-- Role grants
-- PostgREST requires explicit table-level GRANTs; RLS alone is not enough.
-- service_role bypasses RLS AND needs DML privileges.
-- authenticated gets DML; RLS policies restrict rows to the member's own data.
-- anon is intentionally excluded from PHI tables.
-- ─────────────────────────────────────────────

grant usage on schema public to anon, authenticated, service_role;

grant all privileges on all tables     in schema public to service_role;
grant all privileges on all sequences  in schema public to service_role;

grant select, insert, update, delete on all tables    in schema public to authenticated;
grant usage                           on all sequences in schema public to authenticated;

-- Ensure future tables inherit the same grants automatically
alter default privileges in schema public
  grant all privileges on tables    to service_role;
alter default privileges in schema public
  grant all privileges on sequences to service_role;
alter default privileges in schema public
  grant select, insert, update, delete on tables    to authenticated;
alter default privileges in schema public
  grant usage                          on sequences to authenticated;
