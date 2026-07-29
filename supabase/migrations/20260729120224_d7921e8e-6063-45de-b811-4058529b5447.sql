REVOKE ALL ON FUNCTION public.ensure_personal_sport_space(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.ensure_sport_space_owner(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.sync_sport_space_id() FROM PUBLIC, anon, authenticated;