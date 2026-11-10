-- Persistent, privacy-preserving quota buckets for the public guest-capable AI proxy.
-- The Edge Function stores only HMAC-derived bucket keys, never raw IP addresses or user IDs.
CREATE TABLE public.ai_proxy_rate_limits (
  bucket_key text PRIMARY KEY CHECK (bucket_key ~ '^[0-9a-f]{64}$'),
  request_count integer NOT NULL CHECK (request_count > 0),
  expires_at timestamptz NOT NULL
);

CREATE INDEX ai_proxy_rate_limits_expires_at_idx
  ON public.ai_proxy_rate_limits (expires_at);

ALTER TABLE public.ai_proxy_rate_limits ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.ai_proxy_rate_limits FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.ai_proxy_rate_limits TO service_role;

CREATE OR REPLACE FUNCTION public.consume_ai_proxy_rate_limit(
  p_bucket_key text,
  p_max_requests integer,
  p_window_seconds integer
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_count integer;
BEGIN
  IF p_bucket_key IS NULL
     OR p_bucket_key !~ '^[0-9a-f]{64}$'
     OR p_max_requests < 1
     OR p_max_requests > 10000
     OR p_window_seconds < 1
     OR p_window_seconds > 86400 THEN
    RETURN false;
  END IF;

  INSERT INTO public.ai_proxy_rate_limits (bucket_key, request_count, expires_at)
  VALUES (
    p_bucket_key,
    1,
    pg_catalog.now() + pg_catalog.make_interval(secs => p_window_seconds * 2)
  )
  ON CONFLICT (bucket_key) DO UPDATE
  SET request_count = public.ai_proxy_rate_limits.request_count + 1,
      expires_at = EXCLUDED.expires_at
  RETURNING request_count INTO v_count;

  DELETE FROM public.ai_proxy_rate_limits
  WHERE expires_at < pg_catalog.now();

  RETURN v_count <= p_max_requests;
END;
$function$;

REVOKE ALL ON FUNCTION public.consume_ai_proxy_rate_limit(text, integer, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_ai_proxy_rate_limit(text, integer, integer)
  TO service_role;
