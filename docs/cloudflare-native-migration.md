# Cloudflare-Native Migration Plan

This project can move from Supabase to a Cloudflare Workers Paid stack, but it
must be done in phases. Supabase currently provides Auth, Postgres, Realtime,
Storage, RPC functions, RLS, triggers, and admin/service-role access. Cloudflare
replaces those with separate products and app-owned authorization logic.

## Target Stack

- Runtime: Cloudflare Workers via OpenNext.
- Relational data: D1.
- Object/media storage: R2.
- Sessions and short-lived tokens: KV or D1, depending on consistency needs.
- Background work: Queues.
- Per-conversation ordering and live inbox fan-out: Durable Objects.
- Transactional email: Cloudflare Email Service.
- AI knowledge search: Vectorize for embeddings, D1 for document metadata.

## Cloudflare Product Mapping

| Current Supabase feature | Cloudflare replacement | Notes |
| --- | --- | --- |
| Supabase Auth | App-owned auth tables + signed sessions | Cloudflare Access is not a customer-facing CRM auth replacement. |
| Postgres tables | D1 tables | SQLite semantics; no RLS, no Postgres triggers/functions. |
| RLS policies | Server-side authorization guards | Every route/query must enforce account membership and role. |
| Supabase RPC | Worker functions / service modules | Port each RPC to TypeScript or D1 SQL. |
| Supabase Storage | R2 buckets | Store object keys in D1. Serve through authenticated Worker routes. |
| Supabase Realtime | Durable Objects + WebSockets, or polling first | Inbox and notifications need explicit design. |
| Broadcast/automation jobs | Queues + DLQ | At-least-once delivery requires idempotency keys. |
| pgvector | Vectorize | Keep chunk metadata in D1, embeddings in Vectorize. |
| Auth emails | Cloudflare Email Service | Use only for transactional emails. |

## Migration Phases

### Phase 0: Keep Current App Stable

- Keep the current Supabase-backed app running locally and in production.
- Keep the Cloudflare OpenNext deployment path already present in the repo.
- Do not remove `@supabase/*` until all auth/data access has replacement code.

### Phase 1: Cloudflare Infrastructure Skeleton

- Create Cloudflare resources:
  - D1 database: `wacrm`
  - R2 bucket: `wacrm-media`
  - KV namespace: `wacrm-sessions`
  - Queues:
    - `wacrm-whatsapp-events`
    - `wacrm-outbound-messages`
    - `wacrm-email-events`
    - `wacrm-dead-letter`
  - Email Service binding: `EMAIL`
- Set bootstrap secret:
  - `CLOUDFLARE_BOOTSTRAP_SECRET`
- Apply `cloudflare/migrations/0001_foundation.sql` to D1.
- Generate bindings/types with Wrangler after real Cloudflare IDs are known.

### Phase 2: Replace Auth

- Implement app-owned auth:
  - password hashing
  - session cookies
  - email verification
  - password reset
  - invite acceptance
- Replace middleware Supabase session refresh with local session verification.
- Port `profiles`, `accounts`, roles, and invitations first.
- Use `POST /api/cloudflare/bootstrap` once to create the first owner account
  after D1 is configured. The route requires the `x-bootstrap-secret` header and
  should remain unavailable unless `CLOUDFLARE_BOOTSTRAP_SECRET` is set.
- Parallel auth endpoints now exist for the Cloudflare path:
  - `POST /api/cloudflare/auth/login`
  - `GET /api/cloudflare/auth/me`
  - `POST /api/cloudflare/auth/logout`
  These are not wired into the current UI yet; the Supabase login remains the
  active app path until the Cloudflare D1 resources are created and tested.
- Browser-side helpers are staged in:
  - `src/lib/cloudflare/auth-client.ts`
  - `src/hooks/use-cloudflare-auth.tsx`
  These intentionally run in parallel to the existing Supabase `useAuth` hook
  until a feature flag or route-level switch is added.

### Phase 3: Port Core CRM Data

- Replace browser Supabase calls with internal `/api/*` calls.
- Enforce authorization server-side on every endpoint.
- Port modules in this order:
  1. settings/profile/account
  2. contacts/tags/custom fields
  3. inbox/conversations/messages
  4. templates/broadcasts
  5. automations/flows
  6. AI knowledge

### Phase 4: Move Storage and Jobs

- Replace avatar, flow media, and chat media uploads with R2 routes.
- Store object keys, MIME types, sizes, and access scope in D1.
- Move webhook ingestion, outbound message delivery, broadcasts, retries, and
  automation execution to Queues.
- Add idempotency keys to every queue consumer.

### Phase 5: Realtime

- Start with short polling where acceptable.
- Add Durable Objects for:
  - live inbox sessions
  - per-conversation message ordering
  - presence
  - notification fan-out

## Email / Mailchimp-Lite Module Boundary

Cloudflare Email Service is appropriate for transactional email:

- login verification
- password reset
- invitations
- account notices
- event notifications

For a Mailchimp/Klaviyo-lite module, the CRM should implement:

- lists/segments in D1
- consent and unsubscribe tracking
- campaign drafts and templates
- queue-backed sending
- delivery/open/click events where permitted
- suppression checks before every send
- rate limiting per account/domain

Do not treat Cloudflare Email Service as an unrestricted bulk marketing sender.
The product is strongest for transactional mail; campaigns need explicit
compliance, throttling, unsubscribe, and suppression controls.

## Open Risks

- D1 has no RLS; authorization bugs become application bugs.
- D1 is SQLite, not Postgres; every migration and query must be reviewed.
- Supabase Realtime has no direct drop-in equivalent.
- Existing client components call Supabase directly; these must move behind
  server APIs before credentials can be removed from the browser.
- AI semantic search currently uses pgvector; this needs Vectorize.
- Some Supabase SQL functions are business logic and must be ported carefully.

## First Commands After Cloudflare Login

Use these once the Cloudflare account/domain is ready:

```bash
npx wrangler d1 create wacrm
npx wrangler r2 bucket create wacrm-media --location=enam
npx wrangler kv namespace create wacrm-sessions
npx wrangler queues create wacrm-whatsapp-events
npx wrangler queues create wacrm-outbound-messages
npx wrangler queues create wacrm-email-events
npx wrangler queues create wacrm-dead-letter
npx wrangler email sending enable yourdomain.com
npx wrangler secret put CLOUDFLARE_BOOTSTRAP_SECRET
npx wrangler d1 migrations apply wacrm --remote --config cloudflare/wrangler.cloudflare-native.example.jsonc
```

After creating resources, copy the returned IDs into a real deployment
`wrangler.jsonc` or environment-specific config.
