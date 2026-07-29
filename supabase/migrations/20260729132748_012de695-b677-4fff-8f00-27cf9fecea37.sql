-- FEATURE-002.4 — Ventana de arranque evaluable dentro de la misma sentencia.
-- can_bootstrap_sport_space_membership() lee public.sport_spaces y, al usarse en
-- un INSERT ... RETURNING, no ve todavía la fila recién insertada. La política de
-- lectura pasa a evaluar `created_by` directamente sobre la fila y delega en un
-- predicado que sólo consulta las membresías.

CREATE OR REPLACE FUNCTION public.sport_space_has_members(_sport_space_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.sport_space_members m WHERE m.sport_space_id = _sport_space_id
  );
$$;

REVOKE ALL ON FUNCTION public.sport_space_has_members(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sport_space_has_members(uuid) TO authenticated;

COMMENT ON FUNCTION public.sport_space_has_members(uuid) IS
  'Predicado auxiliar de RLS: indica si un SportSpace ya tiene membresías. Sólo consulta sport_space_members, por lo que es válido dentro de INSERT ... RETURNING.';

DROP POLICY IF EXISTS sport_spaces_select ON public.sport_spaces;
CREATE POLICY sport_spaces_select ON public.sport_spaces
  FOR SELECT TO authenticated
  USING (
    public.is_sport_space_member(id)
    OR (created_by = auth.uid() AND NOT public.sport_space_has_members(id))
  );
