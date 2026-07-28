-- Funciones usadas por las políticas RLS: sólo usuarios autenticados
REVOKE ALL ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.can_read_catalog(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.can_write_catalog(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.can_read_version(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_read_catalog(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_write_catalog(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_read_version(uuid) TO authenticated, service_role;

-- Funciones de trigger / mantenimiento: no invocables desde la API
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.set_updated_at() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.forbid_delete() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.guard_published_version() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.guard_version_content() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.guard_metric_code() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.guard_primary_metric_value() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.guard_valuation_immutability() FROM PUBLIC, anon, authenticated;