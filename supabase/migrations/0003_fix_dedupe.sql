-- ============================================================================
-- Akshaya Milan — 0003_fix_dedupe.sql
-- The original partial unique index could not serve as an ON CONFLICT arbiter
-- (Postgres requires a plain unique constraint for `on_conflict=dedupe_key`).
-- A non-partial unique index on dedupe_key still allows many NULL rows
-- (NULLs are distinct under a unique index), so enquiries without a message
-- are unaffected.
-- ============================================================================

drop index if exists public.enquiries_dedupe_key_idx;

create unique index if not exists enquiries_dedupe_key_uniq
  on public.enquiries (dedupe_key);