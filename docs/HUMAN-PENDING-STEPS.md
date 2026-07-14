# Pending Human Steps

Use this checklist for anything that still needs a person to verify, decide, or complete manually.

## Required

- Confirm the documentation move is acceptable for the repo layout, especially the new `/docs` index.
- Review and update any external links that still point at the old root-level markdown paths.
- Validate that the README and docs links render correctly in GitHub.

## Environment and deployment

- Fill in `.env.local` from `.env.local.example` before running the app.
- Verify Supabase credentials, WhatsApp settings, and any Cloudflare migration settings in the target environment.
- Re-check the Cloudflare migration notes before using the native backend assets.

## Optional follow-up

- Decide whether `CLAUDE.md` and `AGENTS.md` should stay at the repository root as agent instructions.
- Merge or split the Cloudflare notes further if a stricter docs taxonomy is desired.

## Omnichannel Matrix rollout

- [ ] Apply `supabase/migrations/032_omnichannel_matrix.sql` to the target Supabase project.
- [ ] Deploy Synapse behind HTTPS and pin the Docker image versions.
- [ ] Create the CRM bot and save its token in **Settings > Omnichannel**.
- [ ] Deploy and register each required mautrix bridge; complete QR/login steps manually.
- [ ] Invite the CRM bot to the bridged portal rooms.
- [ ] Configure `MATRIX_CRON_SECRET` and schedule `/api/matrix/cron` every minute.
- [ ] Map a test portal room, verify inbound/outbound text and media rendering, then roll out production rooms.
- [ ] Add monitoring and backups for Synapse, bridge databases, failed outbox rows, and encryption keys.
