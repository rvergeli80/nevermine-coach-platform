-- FEATURE-002.4 — Seguridad y RLS basada en SportSpace + Membership.
-- owner_id y created_by se conservan como datos, pero dejan de intervenir en autorización.

-- 1. Predicados de acceso por espacio -------------------------------------------------
CREATE OR REPLACE FUNCTION public.can_access_space(_sport_space_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT _sport_space_id IS NOT NULL AND public.is_sport_space_member(_sport_space_id);
$$;

CREATE OR REPLACE FUNCTION public.can_admin_space(_sport_space_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT _sport_space_id IS NOT NULL AND public.is_sport_space_owner(_sport_space_id);
$$;

-- 2. Predicados sobre recursos referenciados (anti inyección referencial) --------------
CREATE OR REPLACE FUNCTION public.can_access_team(_team_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT _team_id IS NULL OR EXISTS (
    SELECT 1 FROM public.teams t WHERE t.id = _team_id AND public.can_access_space(t.sport_space_id));
$$;

CREATE OR REPLACE FUNCTION public.can_access_player(_player_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT _player_id IS NULL OR EXISTS (
    SELECT 1 FROM public.players p WHERE p.id = _player_id AND public.can_access_space(p.sport_space_id));
$$;

CREATE OR REPLACE FUNCTION public.can_access_season(_season_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT _season_id IS NULL OR EXISTS (
    SELECT 1 FROM public.seasons s WHERE s.id = _season_id AND public.can_access_space(s.sport_space_id));
$$;

CREATE OR REPLACE FUNCTION public.can_access_competition(_competition_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT _competition_id IS NULL OR EXISTS (
    SELECT 1 FROM public.competitions c WHERE c.id = _competition_id AND public.can_access_space(c.sport_space_id));
$$;

CREATE OR REPLACE FUNCTION public.can_access_context(_context_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT _context_id IS NULL OR EXISTS (
    SELECT 1 FROM public.observation_contexts c WHERE c.id = _context_id AND public.can_access_space(c.sport_space_id));
$$;

CREATE OR REPLACE FUNCTION public.can_access_subject(_subject_type subject_type, _subject_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE _subject_type
    WHEN 'player' THEN public.can_access_player(_subject_id)
    WHEN 'team'   THEN public.can_access_team(_subject_id)
    ELSE false END;
$$;

-- 3. Catálogos, deportes y versiones: espacio o recurso de plataforma ------------------
CREATE OR REPLACE FUNCTION public.can_use_sport(_sport_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.sports s
    WHERE s.id = _sport_id AND (s.sport_space_id IS NULL OR public.can_access_space(s.sport_space_id)));
$$;

CREATE OR REPLACE FUNCTION public.can_read_catalog(_catalog_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.metric_catalogs c
    WHERE c.id = _catalog_id AND (c.sport_space_id IS NULL OR public.can_access_space(c.sport_space_id)));
$$;

CREATE OR REPLACE FUNCTION public.can_write_catalog(_catalog_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.metric_catalogs c
    WHERE c.id = _catalog_id
      AND (public.can_access_space(c.sport_space_id)
        OR (c.sport_space_id IS NULL AND public.has_role(auth.uid(), 'admin'))));
$$;

-- 4. Políticas por tabla ---------------------------------------------------------------
-- sports
DROP POLICY IF EXISTS sports_select ON public.sports;
DROP POLICY IF EXISTS sports_insert ON public.sports;
DROP POLICY IF EXISTS sports_update ON public.sports;
CREATE POLICY sports_select ON public.sports FOR SELECT TO authenticated
  USING (sport_space_id IS NULL OR public.can_access_space(sport_space_id));
CREATE POLICY sports_insert ON public.sports FOR INSERT TO authenticated
  WITH CHECK (public.can_access_space(sport_space_id)
    OR (sport_space_id IS NULL AND public.has_role(auth.uid(), 'admin')));
CREATE POLICY sports_update ON public.sports FOR UPDATE TO authenticated
  USING (public.can_access_space(sport_space_id)
    OR (sport_space_id IS NULL AND public.has_role(auth.uid(), 'admin')))
  WITH CHECK (public.can_access_space(sport_space_id)
    OR (sport_space_id IS NULL AND public.has_role(auth.uid(), 'admin')));

-- metric_catalogs
DROP POLICY IF EXISTS catalogs_select ON public.metric_catalogs;
DROP POLICY IF EXISTS catalogs_insert ON public.metric_catalogs;
DROP POLICY IF EXISTS catalogs_update ON public.metric_catalogs;
CREATE POLICY catalogs_select ON public.metric_catalogs FOR SELECT TO authenticated
  USING (sport_space_id IS NULL OR public.can_access_space(sport_space_id));
CREATE POLICY catalogs_insert ON public.metric_catalogs FOR INSERT TO authenticated
  WITH CHECK ((public.can_access_space(sport_space_id)
      OR (sport_space_id IS NULL AND public.has_role(auth.uid(), 'admin')))
    AND public.can_use_sport(sport_id));
CREATE POLICY catalogs_update ON public.metric_catalogs FOR UPDATE TO authenticated
  USING (public.can_access_space(sport_space_id)
    OR (sport_space_id IS NULL AND public.has_role(auth.uid(), 'admin')))
  WITH CHECK ((public.can_access_space(sport_space_id)
      OR (sport_space_id IS NULL AND public.has_role(auth.uid(), 'admin')))
    AND public.can_use_sport(sport_id));

-- seasons
DROP POLICY IF EXISTS seasons_own ON public.seasons;
CREATE POLICY seasons_select ON public.seasons FOR SELECT TO authenticated
  USING (public.can_access_space(sport_space_id));
CREATE POLICY seasons_insert ON public.seasons FOR INSERT TO authenticated
  WITH CHECK (public.can_access_space(sport_space_id));
CREATE POLICY seasons_update ON public.seasons FOR UPDATE TO authenticated
  USING (public.can_access_space(sport_space_id))
  WITH CHECK (public.can_access_space(sport_space_id));
CREATE POLICY seasons_delete ON public.seasons FOR DELETE TO authenticated
  USING (public.can_admin_space(sport_space_id));

-- teams
DROP POLICY IF EXISTS teams_own ON public.teams;
CREATE POLICY teams_select ON public.teams FOR SELECT TO authenticated
  USING (public.can_access_space(sport_space_id));
CREATE POLICY teams_insert ON public.teams FOR INSERT TO authenticated
  WITH CHECK (public.can_access_space(sport_space_id) AND public.can_use_sport(sport_id));
CREATE POLICY teams_update ON public.teams FOR UPDATE TO authenticated
  USING (public.can_access_space(sport_space_id))
  WITH CHECK (public.can_access_space(sport_space_id) AND public.can_use_sport(sport_id));
CREATE POLICY teams_delete ON public.teams FOR DELETE TO authenticated
  USING (public.can_admin_space(sport_space_id));

-- players
DROP POLICY IF EXISTS players_select_own ON public.players;
DROP POLICY IF EXISTS players_insert_own ON public.players;
DROP POLICY IF EXISTS players_update_own ON public.players;
DROP POLICY IF EXISTS players_delete_own ON public.players;
CREATE POLICY players_select ON public.players FOR SELECT TO authenticated
  USING (public.can_access_space(sport_space_id));
CREATE POLICY players_insert ON public.players FOR INSERT TO authenticated
  WITH CHECK (public.can_access_space(sport_space_id) AND public.can_access_team(team_id));
CREATE POLICY players_update ON public.players FOR UPDATE TO authenticated
  USING (public.can_access_space(sport_space_id))
  WITH CHECK (public.can_access_space(sport_space_id) AND public.can_access_team(team_id));
CREATE POLICY players_delete ON public.players FOR DELETE TO authenticated
  USING (public.can_admin_space(sport_space_id));

-- competitions
DROP POLICY IF EXISTS competitions_select_own ON public.competitions;
DROP POLICY IF EXISTS competitions_insert_own ON public.competitions;
DROP POLICY IF EXISTS competitions_update_own ON public.competitions;
DROP POLICY IF EXISTS competitions_delete_own ON public.competitions;
CREATE POLICY competitions_select ON public.competitions FOR SELECT TO authenticated
  USING (public.can_access_space(sport_space_id));
CREATE POLICY competitions_insert ON public.competitions FOR INSERT TO authenticated
  WITH CHECK (public.can_access_space(sport_space_id) AND public.can_access_season(season_id));
CREATE POLICY competitions_update ON public.competitions FOR UPDATE TO authenticated
  USING (public.can_access_space(sport_space_id))
  WITH CHECK (public.can_access_space(sport_space_id) AND public.can_access_season(season_id));
CREATE POLICY competitions_delete ON public.competitions FOR DELETE TO authenticated
  USING (public.can_admin_space(sport_space_id));

-- observation_contexts
DROP POLICY IF EXISTS contexts_select_own ON public.observation_contexts;
DROP POLICY IF EXISTS contexts_insert_own ON public.observation_contexts;
DROP POLICY IF EXISTS contexts_update_own ON public.observation_contexts;
DROP POLICY IF EXISTS contexts_delete_own ON public.observation_contexts;
CREATE POLICY contexts_select ON public.observation_contexts FOR SELECT TO authenticated
  USING (public.can_access_space(sport_space_id));
CREATE POLICY contexts_insert ON public.observation_contexts FOR INSERT TO authenticated
  WITH CHECK (public.can_access_space(sport_space_id)
    AND public.can_access_team(team_id)
    AND public.can_access_season(season_id)
    AND public.can_access_competition(competition_id)
    AND (catalog_version_id IS NULL OR public.can_read_version(catalog_version_id)));
CREATE POLICY contexts_update ON public.observation_contexts FOR UPDATE TO authenticated
  USING (public.can_access_space(sport_space_id))
  WITH CHECK (public.can_access_space(sport_space_id)
    AND public.can_access_team(team_id)
    AND public.can_access_season(season_id)
    AND public.can_access_competition(competition_id)
    AND (catalog_version_id IS NULL OR public.can_read_version(catalog_version_id)));
CREATE POLICY contexts_delete ON public.observation_contexts FOR DELETE TO authenticated
  USING (public.can_admin_space(sport_space_id));

-- metric_values
DROP POLICY IF EXISTS values_select_own ON public.metric_values;
DROP POLICY IF EXISTS values_insert_own ON public.metric_values;
DROP POLICY IF EXISTS values_update_own ON public.metric_values;
DROP POLICY IF EXISTS values_delete_own ON public.metric_values;
CREATE POLICY values_select ON public.metric_values FOR SELECT TO authenticated
  USING (public.can_access_space(sport_space_id));
CREATE POLICY values_insert ON public.metric_values FOR INSERT TO authenticated
  WITH CHECK (public.can_access_space(sport_space_id)
    AND public.can_access_context(context_id)
    AND public.can_access_subject(subject_type, subject_id)
    AND public.can_read_metric(metric_id));
CREATE POLICY values_update ON public.metric_values FOR UPDATE TO authenticated
  USING (public.can_access_space(sport_space_id))
  WITH CHECK (public.can_access_space(sport_space_id)
    AND public.can_access_context(context_id)
    AND public.can_access_subject(subject_type, subject_id)
    AND public.can_read_metric(metric_id));
CREATE POLICY values_delete ON public.metric_values FOR DELETE TO authenticated
  USING (public.can_admin_space(sport_space_id));

-- valuations
DROP POLICY IF EXISTS valuations_select_own ON public.valuations;
DROP POLICY IF EXISTS valuations_insert_own ON public.valuations;
DROP POLICY IF EXISTS valuations_update_own ON public.valuations;
CREATE POLICY valuations_select ON public.valuations FOR SELECT TO authenticated
  USING (public.can_access_space(sport_space_id));
CREATE POLICY valuations_insert ON public.valuations FOR INSERT TO authenticated
  WITH CHECK (public.can_access_space(sport_space_id)
    AND public.can_access_subject(subject_type, subject_id)
    AND public.can_access_context(context_id)
    AND public.can_access_season(season_id)
    AND public.can_access_competition(competition_id)
    AND public.can_read_version(catalog_version_id)
    AND public.can_read_valuation_profile(profile_id));
CREATE POLICY valuations_update ON public.valuations FOR UPDATE TO authenticated
  USING (public.can_access_space(sport_space_id))
  WITH CHECK (public.can_access_space(sport_space_id));

-- audit_log
DROP POLICY IF EXISTS audit_select_own ON public.audit_log;
DROP POLICY IF EXISTS audit_insert_own ON public.audit_log;
CREATE POLICY audit_select ON public.audit_log FOR SELECT TO authenticated
  USING (public.can_access_space(sport_space_id) OR actor_id = auth.uid());
CREATE POLICY audit_insert ON public.audit_log FOR INSERT TO authenticated
  WITH CHECK (actor_id = auth.uid()
    AND (sport_space_id IS NULL OR public.can_access_space(sport_space_id)));

-- sport_spaces: visible para sus miembros; edición sólo para Owners.
DROP POLICY IF EXISTS sport_spaces_select_own ON public.sport_spaces;
DROP POLICY IF EXISTS sport_spaces_update_own ON public.sport_spaces;
CREATE POLICY sport_spaces_select ON public.sport_spaces FOR SELECT TO authenticated
  USING (public.is_sport_space_member(id) OR created_by = auth.uid());
CREATE POLICY sport_spaces_update ON public.sport_spaces FOR UPDATE TO authenticated
  USING (public.is_sport_space_owner(id))
  WITH CHECK (public.is_sport_space_owner(id));

-- 5. Retirada de los predicados basados en propiedad individual ------------------------
DROP FUNCTION IF EXISTS public.owns_subject(subject_type, uuid);
DROP FUNCTION IF EXISTS public.owns_team(uuid);
DROP FUNCTION IF EXISTS public.owns_player(uuid);
DROP FUNCTION IF EXISTS public.owns_season(uuid);
DROP FUNCTION IF EXISTS public.owns_competition(uuid);
DROP FUNCTION IF EXISTS public.owns_context(uuid);

-- 6. Los predicados de seguridad no son invocables directamente por los clientes -------
REVOKE ALL ON FUNCTION public.can_access_space(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.can_admin_space(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.can_access_team(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.can_access_player(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.can_access_season(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.can_access_competition(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.can_access_context(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.can_access_subject(subject_type, uuid) FROM PUBLIC, anon, authenticated;
