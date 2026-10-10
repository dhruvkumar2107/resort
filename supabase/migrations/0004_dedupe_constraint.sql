-- 0004: dedupe guard as a UNIQUE CONSTRAINT (not a bare unique index).
-- PostgREST only accepts an on_conflict target backed by a unique constraint
-- created via ALTER TABLE ... ADD CONSTRAINT; a standalone unique index is
-- ignored, so duplicate inserts would throw instead of being idempotent.
-- The live DB still has the standalone unique index from 0001/0003.

drop index if exists public.enquiries_dedupe_key_uniq;

alter table public.enquiries
  add constraint enquiries_dedupe_key_uniq unique (dedupe_key);