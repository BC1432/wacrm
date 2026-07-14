# Cloudflare Native Backend

This folder contains the migration assets for replacing Supabase with a
Cloudflare-native backend.

The current production app still uses Supabase. These files are intentionally
parallel assets so the migration can proceed without breaking local development.

## Files

- `migrations/0001_foundation.sql` - D1 foundation schema for auth, CRM core,
  messaging jobs, media metadata, and email campaigns.
- `wrangler.cloudflare-native.example.jsonc` - example binding layout for a
  Workers Paid deployment.

## Setup Order

1. Create Cloudflare resources with Wrangler.
2. Replace placeholder IDs in the example Wrangler config.
3. Apply the D1 migration.
4. Generate Wrangler types.
5. Set `CLOUDFLARE_BOOTSTRAP_SECRET`.
6. Call `POST /api/cloudflare/bootstrap` once to create the first owner account.
7. Start replacing Supabase data access one module at a time.

Do not remove Supabase dependencies until auth, authorization, storage, realtime,
and background jobs have Cloudflare replacements.
