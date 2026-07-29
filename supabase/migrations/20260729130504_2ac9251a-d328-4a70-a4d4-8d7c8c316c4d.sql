-- Las funciones usadas dentro de las políticas RLS deben ser ejecutables por el rol
-- que consulta (authenticated); se mantienen inaccesibles para anon/PUBLIC.
GRANT EXECUTE ON FUNCTION public.can_access_space(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_admin_space(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_access_team(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_access_player(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_access_season(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_access_competition(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_access_context(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_access_subject(subject_type, uuid) TO authenticated;
