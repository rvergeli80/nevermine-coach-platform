-- =====================================================================
-- NEVERMINE COACH — FASE 0
-- Esquema base: identidad, roles y motor genérico de métricas deportivas
-- El núcleo no contiene conocimiento de ningún deporte concreto.
-- =====================================================================

-- ---------- Tipos ----------
CREATE TYPE public.app_role AS ENUM ('admin', 'coach');
CREATE TYPE public.entity_status AS ENUM ('active', 'inactive', 'archived');
CREATE TYPE public.catalog_version_status AS ENUM ('draft', 'published', 'retired');
CREATE TYPE public.metric_nature AS ENUM ('primary', 'derived');
CREATE TYPE public.metric_value_type AS ENUM ('counter', 'duration', 'boolean', 'ratio', 'scale');
CREATE TYPE public.metric_direction AS ENUM ('higher_is_better', 'lower_is_better', 'neutral');
CREATE TYPE public.subject_scope AS ENUM ('individual', 'collective');
CREATE TYPE public.subject_type AS ENUM ('player', 'team');
CREATE TYPE public.data_source AS ENUM ('manual', 'imported', 'ai');
CREATE TYPE public.valuation_status AS ENUM ('current', 'superseded');

-- ---------- Utilidades ----------
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

-- =====================================================================
-- IDENTIDAD
-- =====================================================================
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text,
  full_name text,
  locale text NOT NULL DEFAULT 'es',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "profiles_select_own" ON public.profiles FOR SELECT TO authenticated USING (id = auth.uid());
CREATE POLICY "profiles_update_own" ON public.profiles FOR UPDATE TO authenticated USING (id = auth.uid()) WITH CHECK (id = auth.uid());
CREATE TRIGGER profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role);
$$;

CREATE POLICY "user_roles_select_own" ON public.user_roles FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

-- Alta automática de perfil + rol por defecto
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data ->> 'full_name', NEW.raw_user_meta_data ->> 'name'))
  ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'coach')
  ON CONFLICT (user_id, role) DO NOTHING;
  RETURN NEW;
END; $$;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- =====================================================================
-- CONFIGURACIÓN DE PLATAFORMA: DEPORTES
-- =====================================================================
CREATE TABLE public.sports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  status public.entity_status NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.sports TO authenticated;
GRANT ALL ON public.sports TO service_role;
ALTER TABLE public.sports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sports_read_all" ON public.sports FOR SELECT TO authenticated USING (true);
CREATE POLICY "sports_admin_write" ON public.sports FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "sports_admin_update" ON public.sports FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE TRIGGER sports_updated_at BEFORE UPDATE ON public.sports FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.event_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sport_id uuid NOT NULL REFERENCES public.sports(id) ON DELETE CASCADE,
  code text NOT NULL,
  name text NOT NULL,
  status public.entity_status NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (sport_id, code)
);
GRANT SELECT, INSERT, UPDATE ON public.event_types TO authenticated;
GRANT ALL ON public.event_types TO service_role;
ALTER TABLE public.event_types ENABLE ROW LEVEL SECURITY;
CREATE POLICY "event_types_read_all" ON public.event_types FOR SELECT TO authenticated USING (true);
CREATE POLICY "event_types_admin_write" ON public.event_types FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "event_types_admin_update" ON public.event_types FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- =====================================================================
-- CATÁLOGO DE MÉTRICAS
-- owner_id NULL  -> catálogo de plataforma (lectura para todos)
-- owner_id != NULL -> catálogo privado del entrenador
-- =====================================================================
CREATE TABLE public.metric_catalogs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sport_id uuid NOT NULL REFERENCES public.sports(id) ON DELETE RESTRICT,
  owner_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  code text NOT NULL,
  name text NOT NULL,
  description text,
  status public.entity_status NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX metric_catalogs_owner_code_key
  ON public.metric_catalogs (sport_id, COALESCE(owner_id, '00000000-0000-0000-0000-000000000000'::uuid), code);
GRANT SELECT, INSERT, UPDATE ON public.metric_catalogs TO authenticated;
GRANT ALL ON public.metric_catalogs TO service_role;
ALTER TABLE public.metric_catalogs ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.can_read_catalog(_catalog_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.metric_catalogs c
    WHERE c.id = _catalog_id AND (c.owner_id IS NULL OR c.owner_id = auth.uid())
  );
$$;

CREATE OR REPLACE FUNCTION public.can_write_catalog(_catalog_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.metric_catalogs c
    WHERE c.id = _catalog_id
      AND (c.owner_id = auth.uid() OR (c.owner_id IS NULL AND public.has_role(auth.uid(), 'admin')))
  );
$$;

CREATE POLICY "catalogs_select" ON public.metric_catalogs FOR SELECT TO authenticated
  USING (owner_id IS NULL OR owner_id = auth.uid());
CREATE POLICY "catalogs_insert" ON public.metric_catalogs FOR INSERT TO authenticated
  WITH CHECK (owner_id = auth.uid() OR (owner_id IS NULL AND public.has_role(auth.uid(), 'admin')));
CREATE POLICY "catalogs_update" ON public.metric_catalogs FOR UPDATE TO authenticated
  USING (owner_id = auth.uid() OR (owner_id IS NULL AND public.has_role(auth.uid(), 'admin')))
  WITH CHECK (owner_id = auth.uid() OR (owner_id IS NULL AND public.has_role(auth.uid(), 'admin')));
CREATE TRIGGER metric_catalogs_updated_at BEFORE UPDATE ON public.metric_catalogs FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------- Versiones de catálogo ----------
CREATE TABLE public.catalog_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  catalog_id uuid NOT NULL REFERENCES public.metric_catalogs(id) ON DELETE CASCADE,
  version_number integer NOT NULL,
  status public.catalog_version_status NOT NULL DEFAULT 'draft',
  change_reason text,
  published_at timestamptz,
  published_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (catalog_id, version_number)
);
GRANT SELECT, INSERT, UPDATE ON public.catalog_versions TO authenticated;
GRANT ALL ON public.catalog_versions TO service_role;
ALTER TABLE public.catalog_versions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "versions_select" ON public.catalog_versions FOR SELECT TO authenticated USING (public.can_read_catalog(catalog_id));
CREATE POLICY "versions_insert" ON public.catalog_versions FOR INSERT TO authenticated WITH CHECK (public.can_write_catalog(catalog_id));
CREATE POLICY "versions_update" ON public.catalog_versions FOR UPDATE TO authenticated USING (public.can_write_catalog(catalog_id)) WITH CHECK (public.can_write_catalog(catalog_id));
CREATE TRIGGER catalog_versions_updated_at BEFORE UPDATE ON public.catalog_versions FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.can_read_version(_version_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.catalog_versions v WHERE v.id = _version_id AND public.can_read_catalog(v.catalog_id));
$$;

-- Una versión publicada es inmutable: sólo puede pasar a 'retired'
CREATE OR REPLACE FUNCTION public.guard_published_version()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF OLD.status = 'published' THEN
    IF NEW.status = 'retired'
       AND NEW.version_number = OLD.version_number
       AND NEW.catalog_id = OLD.catalog_id
       AND NEW.published_at IS NOT DISTINCT FROM OLD.published_at THEN
      RETURN NEW;
    END IF;
    RAISE EXCEPTION 'Una versión publicada es inmutable (sólo puede retirarse)';
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER catalog_versions_immutable BEFORE UPDATE ON public.catalog_versions
  FOR EACH ROW EXECUTE FUNCTION public.guard_published_version();

CREATE OR REPLACE FUNCTION public.forbid_delete()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN RAISE EXCEPTION 'El histórico es inmutable: este registro no puede eliminarse'; END; $$;
CREATE TRIGGER catalog_versions_no_delete BEFORE DELETE ON public.catalog_versions
  FOR EACH ROW EXECUTE FUNCTION public.forbid_delete();

-- Bloqueo de escritura sobre el contenido de una versión ya publicada
CREATE OR REPLACE FUNCTION public.guard_version_content()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
DECLARE v_id uuid; v_status public.catalog_version_status;
BEGIN
  v_id := COALESCE(NEW.version_id, OLD.version_id);
  SELECT status INTO v_status FROM public.catalog_versions WHERE id = v_id;
  IF v_status <> 'draft' THEN
    RAISE EXCEPTION 'La versión % no está en borrador: su contenido es inmutable', v_id;
  END IF;
  RETURN COALESCE(NEW, OLD);
END; $$;

-- ---------- Grupos y métricas ----------
CREATE TABLE public.metric_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  catalog_id uuid NOT NULL REFERENCES public.metric_catalogs(id) ON DELETE CASCADE,
  code text NOT NULL,
  name text NOT NULL,
  color text,
  icon text,
  sort_order integer NOT NULL DEFAULT 0,
  status public.entity_status NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (catalog_id, code)
);
GRANT SELECT, INSERT, UPDATE ON public.metric_groups TO authenticated;
GRANT ALL ON public.metric_groups TO service_role;
ALTER TABLE public.metric_groups ENABLE ROW LEVEL SECURITY;
CREATE POLICY "groups_select" ON public.metric_groups FOR SELECT TO authenticated USING (public.can_read_catalog(catalog_id));
CREATE POLICY "groups_insert" ON public.metric_groups FOR INSERT TO authenticated WITH CHECK (public.can_write_catalog(catalog_id));
CREATE POLICY "groups_update" ON public.metric_groups FOR UPDATE TO authenticated USING (public.can_write_catalog(catalog_id)) WITH CHECK (public.can_write_catalog(catalog_id));

CREATE TABLE public.metrics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  catalog_id uuid NOT NULL REFERENCES public.metric_catalogs(id) ON DELETE CASCADE,
  group_id uuid REFERENCES public.metric_groups(id) ON DELETE SET NULL,
  code text NOT NULL,
  name text NOT NULL,
  short_description text,
  technical_description text,
  icon text,
  color text,
  nature public.metric_nature NOT NULL,
  value_type public.metric_value_type NOT NULL,
  unit text,
  direction public.metric_direction NOT NULL DEFAULT 'higher_is_better',
  scope public.subject_scope NOT NULL DEFAULT 'individual',
  status public.entity_status NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (catalog_id, code)
);
GRANT SELECT, INSERT, UPDATE ON public.metrics TO authenticated;
GRANT ALL ON public.metrics TO service_role;
ALTER TABLE public.metrics ENABLE ROW LEVEL SECURITY;
CREATE POLICY "metrics_select" ON public.metrics FOR SELECT TO authenticated USING (public.can_read_catalog(catalog_id));
CREATE POLICY "metrics_insert" ON public.metrics FOR INSERT TO authenticated WITH CHECK (public.can_write_catalog(catalog_id));
CREATE POLICY "metrics_update" ON public.metrics FOR UPDATE TO authenticated USING (public.can_write_catalog(catalog_id)) WITH CHECK (public.can_write_catalog(catalog_id));
CREATE TRIGGER metrics_updated_at BEFORE UPDATE ON public.metrics FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER metrics_no_delete BEFORE DELETE ON public.metrics FOR EACH ROW EXECUTE FUNCTION public.forbid_delete();

-- El código de una métrica es inmutable
CREATE OR REPLACE FUNCTION public.guard_metric_code()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.code <> OLD.code THEN
    RAISE EXCEPTION 'El código de una métrica es inmutable';
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER metrics_code_immutable BEFORE UPDATE ON public.metrics
  FOR EACH ROW EXECUTE FUNCTION public.guard_metric_code();

-- ---------- Composición de la versión ----------
CREATE TABLE public.catalog_version_metrics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  version_id uuid NOT NULL REFERENCES public.catalog_versions(id) ON DELETE CASCADE,
  metric_id uuid NOT NULL REFERENCES public.metrics(id) ON DELETE CASCADE,
  is_enabled boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (version_id, metric_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.catalog_version_metrics TO authenticated;
GRANT ALL ON public.catalog_version_metrics TO service_role;
ALTER TABLE public.catalog_version_metrics ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cvm_select" ON public.catalog_version_metrics FOR SELECT TO authenticated USING (public.can_read_version(version_id));
CREATE POLICY "cvm_write" ON public.catalog_version_metrics FOR ALL TO authenticated
  USING (public.can_read_version(version_id)) WITH CHECK (public.can_read_version(version_id));
CREATE TRIGGER cvm_draft_only BEFORE INSERT OR UPDATE OR DELETE ON public.catalog_version_metrics
  FOR EACH ROW EXECUTE FUNCTION public.guard_version_content();

-- ---------- Fórmulas ----------
CREATE TABLE public.metric_formulas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  version_id uuid NOT NULL REFERENCES public.catalog_versions(id) ON DELETE CASCADE,
  metric_id uuid NOT NULL REFERENCES public.metrics(id) ON DELETE CASCADE,
  expression text NOT NULL,
  ast jsonb NOT NULL,
  dependencies text[] NOT NULL DEFAULT '{}',
  null_policy text NOT NULL DEFAULT 'zero',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (version_id, metric_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.metric_formulas TO authenticated;
GRANT ALL ON public.metric_formulas TO service_role;
ALTER TABLE public.metric_formulas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "formulas_select" ON public.metric_formulas FOR SELECT TO authenticated USING (public.can_read_version(version_id));
CREATE POLICY "formulas_write" ON public.metric_formulas FOR ALL TO authenticated
  USING (public.can_read_version(version_id)) WITH CHECK (public.can_read_version(version_id));
CREATE TRIGGER formulas_draft_only BEFORE INSERT OR UPDATE OR DELETE ON public.metric_formulas
  FOR EACH ROW EXECUTE FUNCTION public.guard_version_content();

-- ---------- Reglas de validación ----------
CREATE TABLE public.validation_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  version_id uuid NOT NULL REFERENCES public.catalog_versions(id) ON DELETE CASCADE,
  metric_id uuid NOT NULL REFERENCES public.metrics(id) ON DELETE CASCADE,
  rule_type text NOT NULL,
  params jsonb NOT NULL DEFAULT '{}'::jsonb,
  message text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.validation_rules TO authenticated;
GRANT ALL ON public.validation_rules TO service_role;
ALTER TABLE public.validation_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "rules_select" ON public.validation_rules FOR SELECT TO authenticated USING (public.can_read_version(version_id));
CREATE POLICY "rules_write" ON public.validation_rules FOR ALL TO authenticated
  USING (public.can_read_version(version_id)) WITH CHECK (public.can_read_version(version_id));
CREATE TRIGGER rules_draft_only BEFORE INSERT OR UPDATE OR DELETE ON public.validation_rules
  FOR EACH ROW EXECUTE FUNCTION public.guard_version_content();

-- ---------- Perfiles de valoración ----------
CREATE TABLE public.valuation_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  catalog_id uuid NOT NULL REFERENCES public.metric_catalogs(id) ON DELETE CASCADE,
  code text NOT NULL,
  name text NOT NULL,
  description text,
  algorithm text NOT NULL DEFAULT 'weighted_sum_v1',
  status public.entity_status NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (catalog_id, code)
);
GRANT SELECT, INSERT, UPDATE ON public.valuation_profiles TO authenticated;
GRANT ALL ON public.valuation_profiles TO service_role;
ALTER TABLE public.valuation_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "profiles_v_select" ON public.valuation_profiles FOR SELECT TO authenticated USING (public.can_read_catalog(catalog_id));
CREATE POLICY "profiles_v_insert" ON public.valuation_profiles FOR INSERT TO authenticated WITH CHECK (public.can_write_catalog(catalog_id));
CREATE POLICY "profiles_v_update" ON public.valuation_profiles FOR UPDATE TO authenticated USING (public.can_write_catalog(catalog_id)) WITH CHECK (public.can_write_catalog(catalog_id));

-- =====================================================================
-- CONTEXTO DEPORTIVO DEL ENTRENADOR
-- =====================================================================
CREATE TABLE public.seasons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  starts_on date,
  ends_on date,
  status public.entity_status NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.seasons TO authenticated;
GRANT ALL ON public.seasons TO service_role;
ALTER TABLE public.seasons ENABLE ROW LEVEL SECURITY;
CREATE POLICY "seasons_own" ON public.seasons FOR ALL TO authenticated USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());
CREATE TRIGGER seasons_updated_at BEFORE UPDATE ON public.seasons FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.competitions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  season_id uuid REFERENCES public.seasons(id) ON DELETE CASCADE,
  name text NOT NULL,
  status public.entity_status NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.competitions TO authenticated;
GRANT ALL ON public.competitions TO service_role;
ALTER TABLE public.competitions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "competitions_own" ON public.competitions FOR ALL TO authenticated USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());

CREATE TABLE public.teams (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  sport_id uuid NOT NULL REFERENCES public.sports(id) ON DELETE RESTRICT,
  name text NOT NULL,
  category text,
  status public.entity_status NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.teams TO authenticated;
GRANT ALL ON public.teams TO service_role;
ALTER TABLE public.teams ENABLE ROW LEVEL SECURITY;
CREATE POLICY "teams_own" ON public.teams FOR ALL TO authenticated USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());
CREATE TRIGGER teams_updated_at BEFORE UPDATE ON public.teams FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.players (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  team_id uuid REFERENCES public.teams(id) ON DELETE SET NULL,
  full_name text NOT NULL,
  birth_date date,
  status public.entity_status NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.players TO authenticated;
GRANT ALL ON public.players TO service_role;
ALTER TABLE public.players ENABLE ROW LEVEL SECURITY;
CREATE POLICY "players_own" ON public.players FOR ALL TO authenticated USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());
CREATE TRIGGER players_updated_at BEFORE UPDATE ON public.players FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------- Pesos ----------
CREATE TABLE public.metric_weights (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  version_id uuid NOT NULL REFERENCES public.catalog_versions(id) ON DELETE CASCADE,
  profile_id uuid NOT NULL REFERENCES public.valuation_profiles(id) ON DELETE CASCADE,
  metric_id uuid NOT NULL REFERENCES public.metrics(id) ON DELETE CASCADE,
  season_id uuid REFERENCES public.seasons(id) ON DELETE CASCADE,
  competition_id uuid REFERENCES public.competitions(id) ON DELETE CASCADE,
  scope_extra jsonb NOT NULL DEFAULT '{}'::jsonb,
  weight numeric NOT NULL DEFAULT 0,
  sign smallint NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX metric_weights_scope_key ON public.metric_weights (
  version_id, profile_id, metric_id,
  COALESCE(season_id, '00000000-0000-0000-0000-000000000000'::uuid),
  COALESCE(competition_id, '00000000-0000-0000-0000-000000000000'::uuid)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.metric_weights TO authenticated;
GRANT ALL ON public.metric_weights TO service_role;
ALTER TABLE public.metric_weights ENABLE ROW LEVEL SECURITY;
CREATE POLICY "weights_select" ON public.metric_weights FOR SELECT TO authenticated USING (public.can_read_version(version_id));
CREATE POLICY "weights_write" ON public.metric_weights FOR ALL TO authenticated
  USING (public.can_read_version(version_id)) WITH CHECK (public.can_read_version(version_id));
CREATE TRIGGER weights_draft_only BEFORE INSERT OR UPDATE OR DELETE ON public.metric_weights
  FOR EACH ROW EXECUTE FUNCTION public.guard_version_content();

-- =====================================================================
-- OBSERVACIÓN
-- =====================================================================
CREATE TABLE public.observation_contexts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  event_type_id uuid NOT NULL REFERENCES public.event_types(id) ON DELETE RESTRICT,
  season_id uuid REFERENCES public.seasons(id) ON DELETE SET NULL,
  competition_id uuid REFERENCES public.competitions(id) ON DELETE SET NULL,
  team_id uuid REFERENCES public.teams(id) ON DELETE SET NULL,
  catalog_version_id uuid REFERENCES public.catalog_versions(id) ON DELETE RESTRICT,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  label text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.observation_contexts TO authenticated;
GRANT ALL ON public.observation_contexts TO service_role;
ALTER TABLE public.observation_contexts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "contexts_own" ON public.observation_contexts FOR ALL TO authenticated USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());
CREATE TRIGGER contexts_updated_at BEFORE UPDATE ON public.observation_contexts FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.metric_values (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  context_id uuid NOT NULL REFERENCES public.observation_contexts(id) ON DELETE CASCADE,
  metric_id uuid NOT NULL REFERENCES public.metrics(id) ON DELETE RESTRICT,
  subject_type public.subject_type NOT NULL,
  subject_id uuid NOT NULL,
  numeric_value numeric,
  bool_value boolean,
  recorded_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  source public.data_source NOT NULL DEFAULT 'manual',
  UNIQUE (context_id, metric_id, subject_type, subject_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.metric_values TO authenticated;
GRANT ALL ON public.metric_values TO service_role;
ALTER TABLE public.metric_values ENABLE ROW LEVEL SECURITY;
CREATE POLICY "values_own" ON public.metric_values FOR ALL TO authenticated USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());

-- Sólo se registran métricas primarias
CREATE OR REPLACE FUNCTION public.guard_primary_metric_value()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
DECLARE n public.metric_nature;
BEGIN
  SELECT nature INTO n FROM public.metrics WHERE id = NEW.metric_id;
  IF n <> 'primary' THEN
    RAISE EXCEPTION 'Sólo pueden registrarse valores de métricas primarias; las derivadas se calculan';
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER metric_values_primary_only BEFORE INSERT OR UPDATE ON public.metric_values
  FOR EACH ROW EXECUTE FUNCTION public.guard_primary_metric_value();

-- =====================================================================
-- VALORACIONES (histórico congelado)
-- =====================================================================
CREATE TABLE public.valuations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  profile_id uuid NOT NULL REFERENCES public.valuation_profiles(id) ON DELETE RESTRICT,
  catalog_version_id uuid NOT NULL REFERENCES public.catalog_versions(id) ON DELETE RESTRICT,
  subject_type public.subject_type NOT NULL,
  subject_id uuid NOT NULL,
  season_id uuid REFERENCES public.seasons(id) ON DELETE SET NULL,
  competition_id uuid REFERENCES public.competitions(id) ON DELETE SET NULL,
  context_id uuid REFERENCES public.observation_contexts(id) ON DELETE SET NULL,
  score numeric NOT NULL,
  breakdown jsonb NOT NULL DEFAULT '{}'::jsonb,
  weights_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  algorithm text NOT NULL,
  status public.valuation_status NOT NULL DEFAULT 'current',
  superseded_by uuid REFERENCES public.valuations(id) ON DELETE SET NULL,
  calculated_at timestamptz NOT NULL DEFAULT now(),
  calculated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);
GRANT SELECT, INSERT, UPDATE ON public.valuations TO authenticated;
GRANT ALL ON public.valuations TO service_role;
ALTER TABLE public.valuations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "valuations_select_own" ON public.valuations FOR SELECT TO authenticated USING (owner_id = auth.uid());
CREATE POLICY "valuations_insert_own" ON public.valuations FOR INSERT TO authenticated WITH CHECK (owner_id = auth.uid());
CREATE POLICY "valuations_update_own" ON public.valuations FOR UPDATE TO authenticated USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());
CREATE TRIGGER valuations_no_delete BEFORE DELETE ON public.valuations FOR EACH ROW EXECUTE FUNCTION public.forbid_delete();

-- Una valoración sólo puede pasar a 'superseded'; el resto es inmutable
CREATE OR REPLACE FUNCTION public.guard_valuation_immutability()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.score IS DISTINCT FROM OLD.score
     OR NEW.breakdown IS DISTINCT FROM OLD.breakdown
     OR NEW.weights_snapshot IS DISTINCT FROM OLD.weights_snapshot
     OR NEW.catalog_version_id IS DISTINCT FROM OLD.catalog_version_id
     OR NEW.algorithm IS DISTINCT FROM OLD.algorithm
     OR NEW.calculated_at IS DISTINCT FROM OLD.calculated_at THEN
    RAISE EXCEPTION 'Una valoración es inmutable: genere una nueva y marque la anterior como reemplazada';
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER valuations_immutable BEFORE UPDATE ON public.valuations
  FOR EACH ROW EXECUTE FUNCTION public.guard_valuation_immutability();

-- =====================================================================
-- AUDITORÍA
-- =====================================================================
CREATE TABLE public.audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  owner_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  entity_type text NOT NULL,
  entity_id uuid,
  action text NOT NULL,
  catalog_version_id uuid REFERENCES public.catalog_versions(id) ON DELETE SET NULL,
  reason text,
  before_state jsonb,
  after_state jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.audit_log TO authenticated;
GRANT ALL ON public.audit_log TO service_role;
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "audit_select_own" ON public.audit_log FOR SELECT TO authenticated
  USING (owner_id = auth.uid() OR actor_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "audit_insert_own" ON public.audit_log FOR INSERT TO authenticated WITH CHECK (actor_id = auth.uid());
CREATE TRIGGER audit_no_delete BEFORE DELETE ON public.audit_log FOR EACH ROW EXECUTE FUNCTION public.forbid_delete();

-- ---------- Índices de consulta ----------
CREATE INDEX idx_metrics_catalog ON public.metrics (catalog_id, status);
CREATE INDEX idx_versions_catalog ON public.catalog_versions (catalog_id, status);
CREATE INDEX idx_values_context ON public.metric_values (context_id);
CREATE INDEX idx_values_subject ON public.metric_values (subject_type, subject_id);
CREATE INDEX idx_valuations_subject ON public.valuations (subject_type, subject_id, status);
CREATE INDEX idx_contexts_owner ON public.observation_contexts (owner_id, occurred_at DESC);
CREATE INDEX idx_audit_owner ON public.audit_log (owner_id, created_at DESC);