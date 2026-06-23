-- Phase 5: add address and timezone columns to appointments.
-- The Phase 1 schema only stored psc_location (name); the full address and the
-- Quest location's IANA timezone are needed for dashboard display and booking confirmation.
alter table appointments add column if not exists psc_address  text;
alter table appointments add column if not exists psc_timezone text;
