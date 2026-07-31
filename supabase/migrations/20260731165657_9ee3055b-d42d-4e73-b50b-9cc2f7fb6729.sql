-- FEATURE-004.1 — Sports Organization

ALTER TABLE public.sports ADD COLUMN IF NOT EXISTS description text;

CREATE TYPE public.season_state AS ENUM ('draft','active','closed','archived');
CREATE TYPE public.competition_type AS ENUM ('league','cup','tournament','internal_league','friendly');

-- Temporadas: pertenecen a un deporte y tienen ciclo de vida propio.
ALTER TABLE public.seasons
  ADD COLUMN sport_id uuid REFERENCES public.sports(id),
  ADD COLUMN state public.season_state NOT NULL DEFAULT 'draft';

-- Invariante: una única temporada activa por deporte.
CREATE UNIQUE INDEX seasons_one_active_per_sport
  ON public.seasons (sport_id) WHERE state = 'active' AND sport_id IS NOT NULL;

-- Categorías deportivas: siempre dentro de un deporte, nunca globales.
CREATE TABLE public.sport_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sport_space_id uuid NOT NULL REFERENCES public.sport_spaces(id) ON DELETE CASCADE,
  sport_id uuid NOT NULL REFERENCES public.sports(id),
  code text NOT NULL,
  name text NOT NULL,
  description text,
  sort_order integer NOT NULL DEFAULT 0,
  status public.entity_status NOT NULL DEFAULT 'active',
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX sport_categories_code_unique ON public.sport_categories (sport_id, code);
CREATE UNIQUE INDEX sport_categories_name_unique ON public.sport_categories (sport_id, lower(name));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.sport_categories TO authenticated;
GRANT ALL ON public.sport_categories TO service_role;

ALTER TABLE public.sport_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY sport_categories_select ON public.sport_categories
  FOR SELECT TO authenticated USING (public.can_access_space(sport_space_id));
CREATE POLICY sport_categories_insert ON public.sport_categories
  FOR INSERT TO authenticated
  WITH CHECK (public.can_access_space(sport_space_id) AND public.can_use_sport(sport_id));
CREATE POLICY sport_categories_update ON public.sport_categories
  FOR UPDATE TO authenticated USING (public.can_access_space(sport_space_id))
  WITH CHECK (public.can_access_space(sport_space_id) AND public.can_use_sport(sport_id));
CREATE POLICY sport_categories_delete ON public.sport_categories
  FOR DELETE TO authenticated USING (public.can_admin_space(sport_space_id));

CREATE TRIGGER sport_categories_set_updated_at
  BEFORE UPDATE ON public.sport_categories
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Acceso a categorías (integridad referencial en RLS).
CREATE OR REPLACE FUNCTION public.can_access_category(_category_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT _category_id IS NULL OR EXISTS (
    SELECT 1 FROM public.sport_categories c
    WHERE c.id = _category_id AND public.can_access_space(c.sport_space_id));
$$;
REVOKE EXECUTE ON FUNCTION public.can_access_category(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_access_category(uuid) TO authenticated, service_role;

-- Competiciones: deporte + tipo, únicas dentro de su temporada.
ALTER TABLE public.competitions
  ADD COLUMN sport_id uuid REFERENCES public.sports(id),
  ADD COLUMN type public.competition_type NOT NULL DEFAULT 'league';

CREATE UNIQUE INDEX competitions_unique_name_per_season
  ON public.competitions (season_id, lower(name)) WHERE season_id IS NOT NULL;

-- Equipos: deporte + temporada + categoría, únicos por temporada.
ALTER TABLE public.teams
  ADD COLUMN season_id uuid REFERENCES public.seasons(id),
  ADD COLUMN category_id uuid REFERENCES public.sport_categories(id);

CREATE UNIQUE INDEX teams_unique_name_per_season
  ON public.teams (season_id, lower(name)) WHERE season_id IS NOT NULL;

DROP POLICY teams_insert ON public.teams;
CREATE POLICY teams_insert ON public.teams
  FOR INSERT TO authenticated
  WITH CHECK (public.can_access_space(sport_space_id) AND public.can_use_sport(sport_id)
    AND public.can_access_season(season_id) AND public.can_access_category(category_id));
DROP POLICY teams_update ON public.teams;
CREATE POLICY teams_update ON public.teams
  FOR UPDATE TO authenticated USING (public.can_access_space(sport_space_id))
  WITH CHECK (public.can_access_space(sport_space_id) AND public.can_use_sport(sport_id)
    AND public.can_access_season(season_id) AND public.can_access_category(category_id));