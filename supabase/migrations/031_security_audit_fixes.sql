-- ============================================================
-- 031_security_audit_fixes.sql
--
-- Security hardening from the July 2026 audit:
--   1. Lock down SECURITY DEFINER RPC execute grants.
--   2. Enforce account membership inside AI knowledge retrieval RPCs.
--   3. Add a database-backed rate limiter for multi-instance runtimes.
--   4. Make chat / flow media buckets private and member-readable.
--
-- Idempotent — safe to run multiple times.
-- ============================================================

-- ------------------------------------------------------------
-- 1. SECURITY DEFINER RPC execute grants
-- ------------------------------------------------------------

REVOKE ALL ON FUNCTION public.record_webhook_failure(uuid, int) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.record_webhook_failure(uuid, int) FROM anon;
REVOKE ALL ON FUNCTION public.record_webhook_failure(uuid, int) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.record_webhook_failure(uuid, int) TO service_role;

REVOKE ALL ON FUNCTION public.claim_ai_reply_slot(uuid, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.claim_ai_reply_slot(uuid, integer) FROM anon;
REVOKE ALL ON FUNCTION public.claim_ai_reply_slot(uuid, integer) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.claim_ai_reply_slot(uuid, integer) TO service_role;

-- ------------------------------------------------------------
-- 2. AI knowledge RPC account-membership guard
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.match_ai_knowledge_fts(
  p_account_id  uuid,
  p_query       text,
  p_match_count integer
)
RETURNS TABLE (id uuid, content text, rank real) AS $$
  SELECT c.id,
         c.content,
         ts_rank(c.fts, plainto_tsquery('simple', p_query)) AS rank
  FROM ai_knowledge_chunks c
  WHERE c.account_id = p_account_id
    AND (auth.role() = 'service_role' OR is_account_member(p_account_id))
    AND c.fts @@ plainto_tsquery('simple', p_query)
  ORDER BY rank DESC
  LIMIT GREATEST(p_match_count, 0);
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION public.match_ai_knowledge_semantic(
  p_account_id      uuid,
  p_query_embedding text,
  p_match_count     integer
)
RETURNS TABLE (id uuid, content text, distance real) AS $$
  SELECT c.id,
         c.content,
         (c.embedding <=> p_query_embedding::vector(1536)) AS distance
  FROM ai_knowledge_chunks c
  WHERE c.account_id = p_account_id
    AND (auth.role() = 'service_role' OR is_account_member(p_account_id))
    AND c.embedding IS NOT NULL
  ORDER BY c.embedding <=> p_query_embedding::vector(1536)
  LIMIT GREATEST(p_match_count, 0);
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION public.match_ai_knowledge_fts(uuid, text, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.match_ai_knowledge_fts(uuid, text, integer) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.match_ai_knowledge_semantic(uuid, text, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.match_ai_knowledge_semantic(uuid, text, integer) TO authenticated, service_role;

-- ------------------------------------------------------------
-- 3. Shared rate limiter
-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.rate_limit_buckets (
  key text PRIMARY KEY,
  count integer NOT NULL,
  reset_at timestamptz NOT NULL
);

CREATE OR REPLACE FUNCTION public.check_rate_limit(
  p_key text,
  p_limit integer,
  p_window_ms integer
)
RETURNS TABLE (
  success boolean,
  remaining integer,
  reset_at timestamptz,
  limit_value integer
) AS $$
  WITH upserted AS (
    INSERT INTO public.rate_limit_buckets AS b (key, count, reset_at)
    VALUES (
      p_key,
      1,
      now() + make_interval(secs => (p_window_ms::double precision / 1000.0))
    )
    ON CONFLICT (key) DO UPDATE
    SET
      count = CASE
        WHEN b.reset_at <= now() THEN 1
        ELSE b.count + 1
      END,
      reset_at = CASE
        WHEN b.reset_at <= now()
          THEN now() + make_interval(secs => (p_window_ms::double precision / 1000.0))
        ELSE b.reset_at
      END
    RETURNING b.count, b.reset_at
  )
  SELECT
    upserted.count <= p_limit AS success,
    GREATEST(p_limit - upserted.count, 0) AS remaining,
    upserted.reset_at,
    p_limit AS limit_value
  FROM upserted;
$$ LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path = public;

REVOKE ALL ON TABLE public.rate_limit_buckets FROM PUBLIC;
REVOKE ALL ON TABLE public.rate_limit_buckets FROM anon;
REVOKE ALL ON TABLE public.rate_limit_buckets FROM authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.rate_limit_buckets TO service_role;

REVOKE ALL ON FUNCTION public.check_rate_limit(text, integer, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.check_rate_limit(text, integer, integer) FROM anon;
REVOKE ALL ON FUNCTION public.check_rate_limit(text, integer, integer) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.check_rate_limit(text, integer, integer) TO service_role;

-- ------------------------------------------------------------
-- 4. Private media buckets + member-scoped reads
-- ------------------------------------------------------------

UPDATE storage.buckets
SET public = false
WHERE id IN ('chat-media', 'flow-media');

DROP POLICY IF EXISTS "Chat media is publicly readable" ON storage.objects;
DROP POLICY IF EXISTS "Members can read chat media" ON storage.objects;
CREATE POLICY "Members can read chat media"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'chat-media'
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.user_id = auth.uid()
        AND ('account-' || p.account_id::text) = (storage.foldername(name))[1]
    )
  );

DROP POLICY IF EXISTS "Flow media is publicly readable" ON storage.objects;
DROP POLICY IF EXISTS "Members can read flow media" ON storage.objects;
CREATE POLICY "Members can read flow media"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'flow-media'
    AND (
      EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.user_id = auth.uid()
          AND ('account-' || p.account_id::text) = (storage.foldername(name))[1]
      )
      OR auth.uid()::text = (storage.foldername(name))[1]
    )
  );
