-- ============================================================
-- Omnichannel messaging through a Matrix core.
--
-- Existing rows remain WhatsApp conversations/messages. Matrix and
-- future bridges reuse the same CRM entities and Supabase Realtime.
-- ============================================================

ALTER TABLE conversations
  ADD COLUMN IF NOT EXISTS channel text NOT NULL DEFAULT 'whatsapp';
ALTER TABLE conversations
  ADD COLUMN IF NOT EXISTS external_room_id text;
ALTER TABLE conversations
  ADD COLUMN IF NOT EXISTS external_participant_id text;
ALTER TABLE conversations
  ADD COLUMN IF NOT EXISTS transport text NOT NULL DEFAULT 'native';

ALTER TABLE conversations
  DROP CONSTRAINT IF EXISTS conversations_channel_check;
ALTER TABLE conversations
  ADD CONSTRAINT conversations_channel_check
  CHECK (channel IN ('whatsapp', 'telegram', 'signal', 'instagram', 'matrix', 'xmpp'));
ALTER TABLE conversations
  DROP CONSTRAINT IF EXISTS conversations_transport_check;
ALTER TABLE conversations
  ADD CONSTRAINT conversations_transport_check
  CHECK (transport IN ('native', 'matrix', 'xmpp'));

CREATE UNIQUE INDEX IF NOT EXISTS idx_conversations_external_room
  ON conversations(account_id, external_room_id)
  WHERE external_room_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_conversations_external_participant
  ON conversations(account_id, channel, external_participant_id)
  WHERE external_participant_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_conversations_channel
  ON conversations(account_id, channel, last_message_at DESC);

ALTER TABLE messages
  ADD COLUMN IF NOT EXISTS channel text NOT NULL DEFAULT 'whatsapp';
ALTER TABLE messages
  ADD COLUMN IF NOT EXISTS external_event_id text;

ALTER TABLE messages
  DROP CONSTRAINT IF EXISTS messages_channel_check;
ALTER TABLE messages
  ADD CONSTRAINT messages_channel_check
  CHECK (channel IN ('whatsapp', 'telegram', 'signal', 'instagram', 'matrix', 'xmpp'));

CREATE UNIQUE INDEX IF NOT EXISTS idx_messages_external_event
  ON messages(conversation_id, external_event_id);

-- A workspace owns one Matrix bot session. The access token is encrypted
-- with ENCRYPTION_KEY before it reaches this table.
CREATE TABLE IF NOT EXISTS matrix_config (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE UNIQUE,
  created_by_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  homeserver_url text NOT NULL,
  bot_user_id text NOT NULL,
  access_token text NOT NULL,
  sync_token text,
  enabled boolean NOT NULL DEFAULT true,
  last_sync_at timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT matrix_config_https_check
    CHECK (homeserver_url ~ '^https://')
);

ALTER TABLE matrix_config ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS matrix_config_select ON matrix_config;
DROP POLICY IF EXISTS matrix_config_insert ON matrix_config;
DROP POLICY IF EXISTS matrix_config_update ON matrix_config;
DROP POLICY IF EXISTS matrix_config_delete ON matrix_config;
CREATE POLICY matrix_config_select ON matrix_config FOR SELECT
  USING (is_account_member(account_id, 'admin'));
CREATE POLICY matrix_config_insert ON matrix_config FOR INSERT
  WITH CHECK (is_account_member(account_id, 'admin'));
CREATE POLICY matrix_config_update ON matrix_config FOR UPDATE
  USING (is_account_member(account_id, 'admin'))
  WITH CHECK (is_account_member(account_id, 'admin'));
CREATE POLICY matrix_config_delete ON matrix_config FOR DELETE
  USING (is_account_member(account_id, 'admin'));

-- Bridge records are operational metadata. Authentication remains inside
-- each mautrix bridge; the CRM stores only room/status references.
CREATE TABLE IF NOT EXISTS matrix_bridge_connections (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  config_id uuid NOT NULL REFERENCES matrix_config(id) ON DELETE CASCADE,
  bridge text NOT NULL CHECK (bridge IN ('whatsapp', 'telegram', 'signal', 'instagram', 'custom')),
  label text NOT NULL,
  management_room_id text,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'connected', 'disconnected', 'error')),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_matrix_bridges_account
  ON matrix_bridge_connections(account_id, bridge);

ALTER TABLE matrix_bridge_connections ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS matrix_bridges_select ON matrix_bridge_connections;
DROP POLICY IF EXISTS matrix_bridges_insert ON matrix_bridge_connections;
DROP POLICY IF EXISTS matrix_bridges_update ON matrix_bridge_connections;
DROP POLICY IF EXISTS matrix_bridges_delete ON matrix_bridge_connections;
CREATE POLICY matrix_bridges_select ON matrix_bridge_connections FOR SELECT
  USING (is_account_member(account_id));
CREATE POLICY matrix_bridges_insert ON matrix_bridge_connections FOR INSERT
  WITH CHECK (is_account_member(account_id, 'admin'));
CREATE POLICY matrix_bridges_update ON matrix_bridge_connections FOR UPDATE
  USING (is_account_member(account_id, 'admin'))
  WITH CHECK (is_account_member(account_id, 'admin'));
CREATE POLICY matrix_bridges_delete ON matrix_bridge_connections FOR DELETE
  USING (is_account_member(account_id, 'admin'));

-- Persistent delivery queue. Rows are service-only; agents observe the
-- corresponding message status through the normal messages table.
CREATE TABLE IF NOT EXISTS matrix_message_outbox (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  message_id uuid NOT NULL REFERENCES messages(id) ON DELETE CASCADE UNIQUE,
  room_id text NOT NULL,
  content jsonb NOT NULL,
  status text NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'processing', 'retry', 'sent', 'failed')),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  max_attempts integer NOT NULL DEFAULT 8 CHECK (max_attempts BETWEEN 1 AND 20),
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  locked_at timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_matrix_outbox_ready
  ON matrix_message_outbox(next_attempt_at, created_at)
  WHERE status IN ('queued', 'retry', 'processing');

ALTER TABLE matrix_message_outbox ENABLE ROW LEVEL SECURITY;

-- Atomically claim work. Stale processing rows become eligible again after
-- five minutes so a crashed worker cannot strand a message indefinitely.
CREATE OR REPLACE FUNCTION claim_matrix_outbox(batch_size integer DEFAULT 20)
RETURNS SETOF matrix_message_outbox
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH candidates AS (
    SELECT id
    FROM matrix_message_outbox
    WHERE attempts < max_attempts
      AND next_attempt_at <= now()
      AND (
        status IN ('queued', 'retry')
        OR (status = 'processing' AND locked_at < now() - interval '5 minutes')
      )
    ORDER BY created_at
    FOR UPDATE SKIP LOCKED
    LIMIT LEAST(GREATEST(batch_size, 1), 100)
  )
  UPDATE matrix_message_outbox outbox
  SET status = 'processing',
      attempts = outbox.attempts + 1,
      locked_at = now()
  FROM candidates
  WHERE outbox.id = candidates.id
  RETURNING outbox.*;
END;
$$;

REVOKE ALL ON FUNCTION claim_matrix_outbox(integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION claim_matrix_outbox(integer) FROM anon;
REVOKE ALL ON FUNCTION claim_matrix_outbox(integer) FROM authenticated;
GRANT EXECUTE ON FUNCTION claim_matrix_outbox(integer) TO service_role;

-- Keep the denormalised message channel aligned with its conversation.
CREATE OR REPLACE FUNCTION set_message_channel_from_conversation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  SELECT channel INTO NEW.channel
  FROM conversations
  WHERE id = NEW.conversation_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS messages_set_channel ON messages;
CREATE TRIGGER messages_set_channel
  BEFORE INSERT OR UPDATE OF conversation_id ON messages
  FOR EACH ROW EXECUTE FUNCTION set_message_channel_from_conversation();
