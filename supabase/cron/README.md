# supabase/cron — intentionally empty

This directory is intentionally empty post-Phase-5.5 (IN-PX-31).

Cron registrations live in the migration that owns them. The four
pg_cron schedules currently active in the project (`embed-new-titles`,
`enrich-new-titles`, `refresh-service-fingerprints`,
`daily-content-sync`) all live in
`supabase/migrations/039_cron_jobs_vault_jwt.sql`. Edit there.

The previous mirror SQL files (`embed_new_titles.sql`,
`enrich_new_titles.sql`, `refresh_service_fingerprints.sql`) were
duplicate copies that the runtime never read — they were a drift hazard
without an enforcement contract. The cron table on the project remains
the source of truth at the operational layer; migration 039 is the
source of truth at the source-control layer.

Do not re-add mirror SQL files here. If a new cron job is needed, add
it to a new migration alongside the consuming schema, following the
pattern in 039.
