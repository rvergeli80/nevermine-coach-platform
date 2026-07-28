ALTER TABLE public.sports
  ADD COLUMN owner_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE public.sports DROP CONSTRAINT IF EXISTS sports_code_key;
CREATE UNIQUE INDEX sports_owner_code_key
  ON public.sports (COALESCE(owner_id, '00000000-0000-0000-0000-000000000000'::uuid), code);

DROP POLICY IF EXISTS sports_read_all ON public.sports;
DROP POLICY IF EXISTS sports_admin_write ON public.sports;
DROP POLICY IF EXISTS sports_admin_update ON public.sports;

CREATE POLICY sports_select ON public.sports FOR SELECT TO authenticated
  USING (owner_id IS NULL OR owner_id = auth.uid());

CREATE POLICY sports_insert ON public.sports FOR INSERT TO authenticated
  WITH CHECK (
    owner_id = auth.uid()
    OR (owner_id IS NULL AND public.has_role(auth.uid(), 'admin'))
  );

CREATE POLICY sports_update ON public.sports FOR UPDATE TO authenticated
  USING (
    owner_id = auth.uid()
    OR (owner_id IS NULL AND public.has_role(auth.uid(), 'admin'))
  )
  WITH CHECK (
    owner_id = auth.uid()
    OR (owner_id IS NULL AND public.has_role(auth.uid(), 'admin'))
  );

-- Un catálogo sólo puede colgar de un deporte visible para el usuario
CREATE OR REPLACE FUNCTION public.can_use_sport(_sport_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.sports s
    WHERE s.id = _sport_id AND (s.owner_id IS NULL OR s.owner_id = auth.uid())
  );
$$;
REVOKE EXECUTE ON FUNCTION public.can_use_sport(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_use_sport(uuid) TO authenticated;

DROP POLICY IF EXISTS catalogs_insert ON public.metric_catalogs;
CREATE POLICY catalogs_insert ON public.metric_catalogs FOR INSERT TO authenticated
  WITH CHECK (
    ((owner_id = auth.uid()) OR (owner_id IS NULL AND public.has_role(auth.uid(), 'admin')))
    AND public.can_use_sport(sport_id)
  );