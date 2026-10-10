-- ============================================================================
-- Akshaya Milan — 0002_stats_rpc.sql
-- Aggregated, dashboard-grade statistics executed inside Postgres.
-- Only the service role may call these functions.
-- ============================================================================

create or replace function public.stats_overview(
  src timestamptz default null,
  dst timestamptz default null
)
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
declare
  s      timestamptz := coalesce(src, 'epoch'::timestamptz);
  e      timestamptz := coalesce(dst, 'infinity'::timestamptz);
  sdate  date := s::date;
  edate  date := e::date;
  result jsonb;
begin
  select jsonb_build_object(
    -- lifetime totals (unique pseudonymous sessions, not people)
    'sessions_total',    (select count(distinct session_id) from public.visitor_sessions),
    'page_views_total',  (select count(*) from public.page_views),
    'enquiries_total',   (select count(*) from public.enquiries),

    -- window figures
    'sessions_window',   (select count(distinct session_id) from public.visitor_sessions
                          where first_seen_at between s and e),
    'page_views_window', (select count(*) from public.page_views
                          where viewed_at between s and e),
    'enquiries_window',  (select count(*) from public.enquiries
                          where created_at between s and e),

    -- quick date windows for cards
    'sessions_today', (select count(distinct session_id) from public.visitor_sessions
                       where first_seen_at >= date_trunc('day', now())),
    'sessions_7d',    (select count(distinct session_id) from public.visitor_sessions
                       where first_seen_at >= now() - interval '7 days'),
    'sessions_30d',   (select count(distinct session_id) from public.visitor_sessions
                       where first_seen_at >= now() - interval '30 days'),

    -- enquiry pipeline
    'enquiries_status', (
      select coalesce(jsonb_object_agg(status, c), '{}'::jsonb) from (
        select status, count(*)::int as c from public.enquiries
        where created_at between s and e group by status
      ) t
    ),
    'enquiries_by_event', (
      select coalesce(jsonb_agg(x), '[]'::jsonb) from (
        select coalesce(nullif(event_type, ''), 'Not specified') as event_type, count(*)::int as enquiries
        from public.enquiries where created_at between s and e
        group by 1 order by 2 desc
      ) x
    ),
    'conversion_rate', (
      select round(100.0 * count(*) filter (where status = 'converted') / nullif(count(*), 0), 2)
      from public.enquiries
    ),

    -- device / landing / referral analytics
    'device_breakdown', (
      select coalesce(jsonb_object_agg(device_category, c), '{}'::jsonb) from (
        select coalesce(device_category, 'unknown') as device_category, count(distinct session_id)::int as c
        from public.visitor_sessions where first_seen_at between s and e
        group by 1
      ) t
    ),
    'landing_pages', (
      select coalesce(jsonb_agg(x), '[]'::jsonb) from (
        select landing_page as page, count(distinct session_id)::int as sessions
        from public.visitor_sessions where first_seen_at between s and e
        group by 1 order by 2 desc limit 10
      ) x
    ),
    'referrers', (
      select coalesce(jsonb_agg(x), '[]'::jsonb) from (
        select coalesce(referrer_domain, 'direct') as domain, count(distinct session_id)::int as sessions
        from public.visitor_sessions
        where first_seen_at between s and e
        group by 1 order by 2 desc limit 10
      ) x
    ),

    -- recent pseudonymous activity for the dashboard feed
    'recent_activity', (
      select coalesce(jsonb_agg(x), '[]'::jsonb) from (
        select pv.viewed_at as time,
               pv.page_path as path,
               pv.referrer_domain as referrer,
               vs.device_category as device,
               vs.session_id as session_id
        from public.page_views pv
        left join public.visitor_sessions vs on vs.session_id = pv.session_id
        where pv.viewed_at between s and e
        order by pv.viewed_at desc limit 12
      ) x
    ),

    -- per-day series for charts
    'daily_series', (
      select coalesce(jsonb_agg(x order by x.day), '[]'::jsonb) from (
        select g::date as day,
          (select count(*)::int from public.page_views pv where pv.viewed_at::date = g::date) as page_views,
          (select count(distinct vs.session_id)::int from public.visitor_sessions vs
           where vs.first_seen_at::date = g::date) as sessions,
          (select count(*)::int from public.enquiries en where en.created_at::date = g::date) as enquiries,
          (select count(*)::int from public.enquiries en2
           where en2.created_at::date = g::date and en2.status = 'converted') as converted
        from generate_series(sdate, edate, interval '1 day') g
      ) x
    ),

    -- consent health (privacy disclosure: how many sessions opted in)
    'consent_breakdown', (
      select coalesce(jsonb_object_agg(consent_status, c), '{}'::jsonb) from (
        select consent_status, count(distinct session_id)::int as c
        from public.visitor_sessions where first_seen_at between s and e
        group by 1
      ) t
    )
  ) into result;

  return result;
end;
$$;

revoke all on function public.stats_overview(timestamptz, timestamptz) from anon, authenticated, public;
grant execute on function public.stats_overview(timestamptz, timestamptz) to service_role;