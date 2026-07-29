-- Endurecimiento: ninguna función interna es invocable por PUBLIC/anon.
DO $$
DECLARE f record;
BEGIN
  FOR f IN
    SELECT p.oid::regprocedure AS sig
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', f.sig);
  END LOOP;
END $$;

-- Sólo los predicados evaluados dentro de políticas RLS se conceden a authenticated.
GRANT EXECUTE ON FUNCTION public.has_role(uuid, app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_sport_space_member(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_sport_space_owner(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_bootstrap_sport_space_membership(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_access_space(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_admin_space(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_access_team(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_access_player(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_access_season(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_access_competition(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_access_context(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_access_subject(subject_type, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_use_sport(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_read_catalog(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_write_catalog(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_read_version(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_read_metric(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_read_valuation_profile(uuid) TO authenticated;
