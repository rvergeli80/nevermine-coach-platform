-- Helper functions (security definer) to verify ownership of referenced rows
CREATE OR REPLACE FUNCTION public.owns_context(_context_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT _context_id IS NULL OR EXISTS (
    SELECT 1 FROM public.observation_contexts c WHERE c.id = _context_id AND c.owner_id = auth.uid()
  );
$$;

CREATE OR REPLACE FUNCTION public.owns_team(_team_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT _team_id IS NULL OR EXISTS (
    SELECT 1 FROM public.teams t WHERE t.id = _team_id AND t.owner_id = auth.uid()
  );
$$;

CREATE OR REPLACE FUNCTION public.owns_player(_player_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT _player_id IS NULL OR EXISTS (
    SELECT 1 FROM public.players p WHERE p.id = _player_id AND p.owner_id = auth.uid()
  );
$$;

CREATE OR REPLACE FUNCTION public.owns_season(_season_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT _season_id IS NULL OR EXISTS (
    SELECT 1 FROM public.seasons s WHERE s.id = _season_id AND s.owner_id = auth.uid()
  );
$$;

CREATE OR REPLACE FUNCTION public.owns_competition(_competition_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT _competition_id IS NULL OR EXISTS (
    SELECT 1 FROM public.competitions c WHERE c.id = _competition_id AND c.owner_id = auth.uid()
  );
$$;

CREATE OR REPLACE FUNCTION public.owns_subject(_subject_type public.subject_type, _subject_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE _subject_type
    WHEN 'player' THEN public.owns_player(_subject_id)
    WHEN 'team'   THEN public.owns_team(_subject_id)
    ELSE false END;
$$;

CREATE OR REPLACE FUNCTION public.can_read_metric(_metric_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.metrics m WHERE m.id = _metric_id AND public.can_read_catalog(m.catalog_id)
  );
$$;

CREATE OR REPLACE FUNCTION public.can_read_valuation_profile(_profile_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.valuation_profiles p WHERE p.id = _profile_id AND public.can_read_catalog(p.catalog_id)
  );
$$;

REVOKE EXECUTE ON FUNCTION public.owns_context(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.owns_team(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.owns_player(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.owns_season(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.owns_competition(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.owns_subject(public.subject_type, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.can_read_metric(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.can_read_valuation_profile(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.owns_context(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.owns_team(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.owns_player(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.owns_season(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.owns_competition(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.owns_subject(public.subject_type, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_read_metric(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_read_valuation_profile(uuid) TO authenticated;

-- metric_values: no cross-tenant references
DROP POLICY IF EXISTS values_own ON public.metric_values;
CREATE POLICY values_select_own ON public.metric_values FOR SELECT TO authenticated
  USING (owner_id = auth.uid());
CREATE POLICY values_insert_own ON public.metric_values FOR INSERT TO authenticated
  WITH CHECK (
    owner_id = auth.uid()
    AND public.owns_context(context_id)
    AND public.owns_subject(subject_type, subject_id)
    AND public.can_read_metric(metric_id)
  );
CREATE POLICY values_update_own ON public.metric_values FOR UPDATE TO authenticated
  USING (owner_id = auth.uid())
  WITH CHECK (
    owner_id = auth.uid()
    AND public.owns_context(context_id)
    AND public.owns_subject(subject_type, subject_id)
    AND public.can_read_metric(metric_id)
  );
CREATE POLICY values_delete_own ON public.metric_values FOR DELETE TO authenticated
  USING (owner_id = auth.uid());

-- observation_contexts: referenced rows must belong to the coach
DROP POLICY IF EXISTS contexts_own ON public.observation_contexts;
CREATE POLICY contexts_select_own ON public.observation_contexts FOR SELECT TO authenticated
  USING (owner_id = auth.uid());
CREATE POLICY contexts_insert_own ON public.observation_contexts FOR INSERT TO authenticated
  WITH CHECK (
    owner_id = auth.uid()
    AND public.owns_team(team_id)
    AND public.owns_season(season_id)
    AND public.owns_competition(competition_id)
    AND (catalog_version_id IS NULL OR public.can_read_version(catalog_version_id))
  );
CREATE POLICY contexts_update_own ON public.observation_contexts FOR UPDATE TO authenticated
  USING (owner_id = auth.uid())
  WITH CHECK (
    owner_id = auth.uid()
    AND public.owns_team(team_id)
    AND public.owns_season(season_id)
    AND public.owns_competition(competition_id)
    AND (catalog_version_id IS NULL OR public.can_read_version(catalog_version_id))
  );
CREATE POLICY contexts_delete_own ON public.observation_contexts FOR DELETE TO authenticated
  USING (owner_id = auth.uid());

-- valuations
DROP POLICY IF EXISTS valuations_insert_own ON public.valuations;
DROP POLICY IF EXISTS valuations_update_own ON public.valuations;
CREATE POLICY valuations_insert_own ON public.valuations FOR INSERT TO authenticated
  WITH CHECK (
    owner_id = auth.uid()
    AND public.owns_subject(subject_type, subject_id)
    AND public.owns_context(context_id)
    AND public.owns_season(season_id)
    AND public.owns_competition(competition_id)
    AND public.can_read_version(catalog_version_id)
    AND public.can_read_valuation_profile(profile_id)
  );
CREATE POLICY valuations_update_own ON public.valuations FOR UPDATE TO authenticated
  USING (owner_id = auth.uid())
  WITH CHECK (owner_id = auth.uid());

-- players / competitions / teams references
DROP POLICY IF EXISTS players_own ON public.players;
CREATE POLICY players_select_own ON public.players FOR SELECT TO authenticated USING (owner_id = auth.uid());
CREATE POLICY players_insert_own ON public.players FOR INSERT TO authenticated
  WITH CHECK (owner_id = auth.uid() AND public.owns_team(team_id));
CREATE POLICY players_update_own ON public.players FOR UPDATE TO authenticated
  USING (owner_id = auth.uid())
  WITH CHECK (owner_id = auth.uid() AND public.owns_team(team_id));
CREATE POLICY players_delete_own ON public.players FOR DELETE TO authenticated USING (owner_id = auth.uid());

DROP POLICY IF EXISTS competitions_own ON public.competitions;
CREATE POLICY competitions_select_own ON public.competitions FOR SELECT TO authenticated USING (owner_id = auth.uid());
CREATE POLICY competitions_insert_own ON public.competitions FOR INSERT TO authenticated
  WITH CHECK (owner_id = auth.uid() AND public.owns_season(season_id));
CREATE POLICY competitions_update_own ON public.competitions FOR UPDATE TO authenticated
  USING (owner_id = auth.uid())
  WITH CHECK (owner_id = auth.uid() AND public.owns_season(season_id));
CREATE POLICY competitions_delete_own ON public.competitions FOR DELETE TO authenticated USING (owner_id = auth.uid());