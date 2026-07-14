#!/usr/bin/env bash
set -euo pipefail

: "${MATRIX_HOMESERVER_URL:?Set MATRIX_HOMESERVER_URL, for example https://matrix.example.com}"
: "${MATRIX_BOT_USER:?Set MATRIX_BOT_USER, for example crm-bot}"
: "${MATRIX_BOT_PASSWORD:?Set MATRIX_BOT_PASSWORD}"

SYNAPSE_CONTAINER="${SYNAPSE_CONTAINER:-matrix-synapse-1}"

docker exec -i "${SYNAPSE_CONTAINER}" register_new_matrix_user \
  -c /data/homeserver.yaml \
  -u "${MATRIX_BOT_USER}" \
  -p "${MATRIX_BOT_PASSWORD}" \
  --no-admin \
  http://localhost:8008

echo "Bot created. Requesting a Matrix access token..." >&2
curl --fail-with-body --silent --show-error \
  -X POST "${MATRIX_HOMESERVER_URL%/}/_matrix/client/v3/login" \
  -H 'Content-Type: application/json' \
  --data "{\"type\":\"m.login.password\",\"identifier\":{\"type\":\"m.id.user\",\"user\":\"${MATRIX_BOT_USER}\"},\"password\":\"${MATRIX_BOT_PASSWORD}\"}"

echo >&2
echo "Store the returned access_token in Settings > Omnichannel. Do not commit it." >&2
