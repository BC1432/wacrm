# Omnichannel Matrix upgrade

## Architecture

The CRM keeps Supabase as its source of truth and uses Matrix as the messaging
core. Matrix bridges create one room per external conversation. The CRM bot
reads those rooms, maps them to `conversations`, stores each event in
`messages`, and publishes agent replies back to the same room.

```text
WhatsApp / Telegram / Signal / Instagram
                  |
             mautrix bridges
                  |
              Synapse
                  |
      /api/matrix/cron + matrix-js-sdk
                  |
         Supabase + Realtime
                  |
                Inbox
```

WhatsApp Cloud API remains the fallback for existing rows. Migration 032 marks
all existing conversations and messages as `whatsapp` with `transport=native`;
only conversations marked `transport=matrix` are sent through Matrix.

## 1. Deploy Synapse

1. Copy `deploy/matrix/.env.example` to `deploy/matrix/.env` and replace the
   database password and server name.
2. Generate the initial Synapse configuration:

   ```bash
   docker run --rm -it \
     -v "$PWD/deploy/matrix/synapse-data:/data" \
     -e SYNAPSE_SERVER_NAME=matrix.example.com \
     -e SYNAPSE_REPORT_STATS=no \
     matrixdotorg/synapse:latest generate
   ```

3. Edit `homeserver.yaml` to use the `postgres` service, then start the stack:

   ```bash
   docker compose --env-file deploy/matrix/.env \
     -f deploy/matrix/docker-compose.yml up -d
   ```

4. Put Synapse behind an HTTPS reverse proxy and configure the Matrix
   `/.well-known` files. Do not expose port 8008 directly to the internet.

Pin image versions before production. `latest` is convenient for initial setup,
but it is not a reproducible production release.

## 2. Create the CRM bot

Run the included script against the Synapse container:

```bash
export MATRIX_HOMESERVER_URL=https://matrix.example.com
export MATRIX_BOT_USER=crm-bot
export MATRIX_BOT_PASSWORD='replace-with-a-long-password'
export SYNAPSE_CONTAINER=matrix-synapse-1
npm run matrix:register-bot
```

The command prints a JSON login response. Store its `access_token` in
**Settings > Omnichannel**. The token is encrypted with `ENCRYPTION_KEY` before
it is stored in Supabase.

## 3. Install bridges

Deploy each mautrix bridge as a separate service and register its appservice
YAML in `homeserver.yaml`. Follow the bridge version's own documentation; the
exact registration fields change between releases.

- `mautrix-whatsapp`: start a management-room chat with the bridge bot and use
  its login command to display and scan the QR code.
- `mautrix-telegram`: configure Telegram API credentials, then authenticate the
  desired user or bot from the management room.
- `mautrix-signal`: provision the bridge daemon and link the Signal device from
  its management room.
- `mautrix-instagram`: use a dedicated business account and review the bridge's
  current rate-limit and account-risk guidance before enabling it.

Invite `@crm-bot:<server>` to every bridged portal room. Register each bridge
and its management room in **Settings > Omnichannel**. The stored bridge rows
are operational metadata; bridge credentials remain inside the bridge service.

For SaaS, automate bridge provisioning in a separate control plane. Do not run
QR sessions or bridge subprocesses inside a Next.js request.

## 4. Apply the CRM migration

```bash
npm install
supabase migration up --linked
```

Migration `032_omnichannel_matrix.sql` adds:

- `channel`, `transport`, and `external_room_id` to conversations;
- `channel` and deduplicating `external_event_id` to messages;
- encrypted Matrix configuration and bridge metadata;
- a persistent outbox with atomic claims, retries, and dead-letter status.

Set `MATRIX_CRON_SECRET` in the CRM runtime and schedule this request every
minute:

```bash
curl --fail \
  -H "x-cron-secret: $MATRIX_CRON_SECRET" \
  https://crm.example.com/api/matrix/cron
```

The same invocation imports inbound events and drains outbound retries. The
sync token is committed only after an account sync succeeds, and
`external_event_id` prevents duplicate messages when a batch is replayed.

Homeserver URLs resolving to private or reserved addresses are rejected by
default. If the CRM and Synapse intentionally share a trusted private network,
set `MATRIX_ALLOW_PRIVATE_HOMESERVER=true`; never enable it for a public
multi-tenant deployment.

## 5. Existing conversation migration

No data rewrite is required for current WhatsApp Cloud API conversations. To
move one conversation to a bridge, ensure the bot is in the Matrix room, then
update that CRM row with the bridge channel and room ID:

```sql
update conversations
set channel = 'whatsapp',
    transport = 'matrix',
    external_room_id = '!portal-room:matrix.example.com'
where id = '<conversation-uuid>';
```

During a staged migration, leave rows without `external_room_id` on the native
WhatsApp path. Validate inbound and outbound delivery in a test workspace
before mapping production rooms.

## Security and operations

- Use HTTPS for Synapse and the CRM; never expose access tokens to browser code.
- Rotate the bot token if it appears in logs or shell history.
- Monitor `matrix_config.last_error`, failed outbox rows, cron latency, Synapse
  health, bridge reconnect loops, and room membership changes.
- Back up Synapse PostgreSQL, bridge databases, encryption keys, and Supabase.
- Restrict bot room membership to the workspace it serves. A shared SaaS bot
  needs an audited room-to-account provisioning process.

## Current boundary

Inbound Matrix text and media events are represented in the Inbox; outbound
Matrix delivery is intentionally text-only in this version. WhatsApp templates,
interactive flows, broadcasts, and outbound media continue through the native
Meta integration until channel-specific Matrix implementations are added.
