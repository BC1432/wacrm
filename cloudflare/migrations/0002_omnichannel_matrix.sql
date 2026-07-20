-- Add omnichannel columns to conversations
ALTER TABLE conversations ADD COLUMN channel TEXT NOT NULL DEFAULT 'whatsapp';
ALTER TABLE conversations ADD COLUMN external_room_id TEXT;
ALTER TABLE conversations ADD COLUMN external_participant_id TEXT;
ALTER TABLE conversations ADD COLUMN transport TEXT NOT NULL DEFAULT 'native';

-- Add omnichannel columns to messages
ALTER TABLE messages ADD COLUMN channel TEXT NOT NULL DEFAULT 'whatsapp';
ALTER TABLE messages ADD COLUMN external_event_id TEXT;

-- Create matrix_config table
CREATE TABLE IF NOT EXISTS matrix_config (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL UNIQUE REFERENCES accounts(id) ON DELETE CASCADE,
  created_by_user_id TEXT REFERENCES auth_users(id) ON DELETE SET NULL,
  homeserver_url TEXT NOT NULL,
  bot_user_id TEXT NOT NULL,
  access_token TEXT NOT NULL,
  sync_token TEXT,
  enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
  last_sync_at TEXT,
  last_error TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT matrix_config_https_check CHECK (homeserver_url LIKE 'https://%')
);

-- Create matrix_bridge_connections table
CREATE TABLE IF NOT EXISTS matrix_bridge_connections (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  config_id TEXT NOT NULL REFERENCES matrix_config(id) ON DELETE CASCADE,
  bridge TEXT NOT NULL CHECK (bridge IN ('whatsapp', 'telegram', 'signal', 'instagram', 'custom')),
  label TEXT NOT NULL,
  management_room_id TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'connected', 'disconnected', 'error')),
  metadata TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Create matrix_message_outbox table
CREATE TABLE IF NOT EXISTS matrix_message_outbox (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  message_id TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE UNIQUE,
  room_id TEXT NOT NULL,
  content TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'processing', 'retry', 'sent', 'failed')),
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  max_attempts INTEGER NOT NULL DEFAULT 8 CHECK (max_attempts BETWEEN 1 AND 20),
  next_attempt_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  locked_at TEXT,
  last_error TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  sent_at TEXT
);

-- Indexing
CREATE UNIQUE INDEX IF NOT EXISTS idx_conversations_external_room
  ON conversations(account_id, external_room_id)
  WHERE external_room_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_conversations_external_participant
  ON conversations(account_id, channel, external_participant_id)
  WHERE external_participant_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_conversations_channel
  ON conversations(account_id, channel, last_message_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_messages_external_event
  ON messages(conversation_id, external_event_id);
CREATE INDEX IF NOT EXISTS idx_matrix_bridges_account
  ON matrix_bridge_connections(account_id, bridge);
CREATE INDEX IF NOT EXISTS idx_matrix_outbox_ready
  ON matrix_message_outbox(next_attempt_at, created_at)
  WHERE status IN ('queued', 'retry', 'processing');
