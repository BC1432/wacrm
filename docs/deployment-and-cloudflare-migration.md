# Deployment and Cloudflare Migration Notes

## Current deployment shape

This project is a full Next.js CRM, not a purely static website. The normal build generates server-rendered routes, API routes, middleware/proxy behaviour, and client-side Supabase access. That matters for hosting:

- GitHub Pages can only serve static files from `out/`.
- The current CRM needs a runtime for `/api/*`, auth/session refresh, WhatsApp webhooks, AI endpoints, cron endpoints, invitations, and dynamic detail pages.
- Cloudflare Workers can run the Next.js server runtime through OpenNext, so it is the better target for the complete application.

## GitHub Pages

Prepared files:

- `.github/workflows/deploy-github-pages.yml`
- `npm run build:github-pages`
- `NEXT_OUTPUT=export` support in `next.config.ts`

Required repository setup:

- Enable GitHub Pages with source `GitHub Actions`.
- Add these repository secrets before running the workflow:
  - `NEXT_PUBLIC_SUPABASE_URL`
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
  - `ENCRYPTION_KEY`
  - `META_APP_SECRET`

Expected limitation: the workflow is useful only if the app can be statically exported. Today this repo still contains dynamic App Router pages, middleware, and many route handlers. If the static export fails, that is an accurate signal that the app must either be reduced to a static frontend or deployed to a runtime host.

## Cloudflare Workers

Prepared files:

- `wrangler.jsonc`
- `open-next.config.ts`
- `.github/workflows/deploy-cloudflare-workers.yml`
- `npm run build:workers`
- `npm run preview:workers`
- `npm run deploy:workers`
- `npm run cf-typegen`

Required Cloudflare setup:

- Authenticate Wrangler locally with `npx wrangler login`, or configure `CLOUDFLARE_API_TOKEN` in CI.
- For GitHub Actions deploys, add `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_TOKEN` as repository secrets.
- Set production secrets with `wrangler secret put`, especially:
  - `NEXT_PUBLIC_SUPABASE_URL`
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
  - `SUPABASE_SERVICE_ROLE_KEY`
  - `ENCRYPTION_KEY`
  - `META_APP_SECRET`
  - `NEXT_PUBLIC_SITE_URL`
  - `AUTOMATION_CRON_SECRET`, if Wait steps/cron processing are enabled
  - `META_APP_ID`, if image-header WhatsApp templates are enabled
  - `AI_REQUEST_TIMEOUT_MS` and `AI_CONTEXT_MESSAGE_LIMIT`, only if overriding AI defaults. Provider keys are configured per account inside the CRM, not as global deployment secrets.
- Run `npm run preview:workers` before `npm run deploy:workers`.

## Migrating from Supabase to a $5 Cloudflare Workers account

### Advantages

- One vendor for app runtime, edge routing, async processing, static assets, and several storage primitives.
- Workers is a strong fit for webhook-heavy systems like WhatsApp CRM events because incoming requests can be handled close to users and providers.
- Queues can absorb bursts from WhatsApp webhooks, broadcasts, automations, and retry workflows.
- Durable Objects can model strongly consistent per-conversation, per-account, or per-automation coordination.
- D1 can replace parts of the relational workload where SQLite semantics are acceptable.
- R2 can replace Supabase Storage for media attachments with S3-compatible object storage.
- KV can hold low-churn configuration, feature flags, and cache entries.
- Moving backend endpoints to Workers can reduce the need for a traditional Node server.

### Disadvantages

- Supabase currently gives this app Postgres, Auth, Realtime, Storage, Row Level Security, SQL migrations, and admin tooling as one integrated backend. Cloudflare is more modular, so the migration is a rebuild, not a lift-and-shift.
- D1 is SQLite-based, not Postgres. Existing SQL, RLS policies, joins, generated types, triggers, and Supabase-specific client assumptions need review.
- Supabase Auth would need to remain in place or be replaced with another identity layer. Cloudflare Access is not a drop-in replacement for customer-facing CRM auth.
- Realtime inbox updates currently map naturally to Supabase Realtime. On Cloudflare, you would need WebSockets, Durable Objects, polling, or another realtime service.
- The app uses many server routes that call Supabase service-role logic. Those routes must be rewritten against D1/R2/KV/Queues/Durable Objects or kept on Supabase during a staged migration.
- Local development and testing become more complex because you need Workers runtime previews plus local or remote bindings.
- The $5 plan may still need paid usage for storage, queues, D1, R2, AI, logs, and high-volume messaging depending on traffic.

### Messaging-specific notes

- Good candidates for Cloudflare Queues:
  - inbound WhatsApp webhook event fan-out
  - outbound broadcast jobs
  - retry queues for Meta API failures
  - automation/flow execution tasks
  - AI draft generation jobs that should not block the UI
- Good candidates for Durable Objects:
  - conversation-level ordering
  - per-account rate limiting
  - live inbox sessions
  - presence/state coordination
- Keep message history in a queryable database. D1 may work for small to medium tenants, but review query patterns, indexes, backup/restore, and reporting requirements before replacing Postgres.

### Recommended migration path

1. Deploy the current app to Workers with OpenNext while keeping Supabase as the database/auth/storage backend.
2. Move webhook ingestion and background jobs to Workers + Queues first.
3. Move media storage from Supabase Storage to R2 if attachment volume is a cost or scalability concern.
4. Prototype one isolated module on D1, such as webhook delivery logs or API keys.
5. Only migrate core CRM tables after validating auth, permissions, realtime updates, backups, and reporting.

Recommendation: do not migrate the whole data layer from Supabase immediately. Use Cloudflare Workers first as the runtime and messaging/queue layer, then migrate storage/database pieces only where there is a concrete cost, latency, or operational benefit.
