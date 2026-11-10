-- Keep trigger function object resolution deterministic.
-- The function body only uses NEW and pg_catalog.now(), so pg_catalog is sufficient.
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$;
