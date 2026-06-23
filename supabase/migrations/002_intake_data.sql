-- Phase 4: add intake_data to orders
-- Stores the patient demographics submitted at intake before the Junction call.
-- Keeping it on the orders row (vs. a separate table) minimises PHI surface area.
-- If the Junction call fails, the data is already persisted so the patient can retry
-- without re-entering the form.

alter table orders add column if not exists intake_data jsonb;
