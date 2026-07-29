-- FEATURE-002.7 — Corrección menor de certificación.
-- Las funciones que MUTAN estado (crean SportSpaces, asignan Owners) o que son
-- disparadores internos no deben ser invocables directamente vía Data API.
-- Las funciones-predicado (can_*, is_*, has_role) SÍ deben conservar EXECUTE:
-- las políticas RLS las evalúan como el usuario que consulta.

REVOKE EXECUTE ON FUNCTION public.ensure_personal_sport_space(uuid) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.ensure_sport_space_owner(uuid) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.resolve_sport_space_for_user(uuid) FROM anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.sync_sport_space_id() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.enforce_first_member_is_owner() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.enforce_last_owner_remains() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon, authenticated;
