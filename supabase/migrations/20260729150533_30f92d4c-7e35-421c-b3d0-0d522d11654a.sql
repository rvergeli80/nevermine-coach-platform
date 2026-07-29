-- FEATURE-003.1 — Starter Packs oficiales: estado de instalación, historial e instalación transaccional.

CREATE TYPE public.starter_pack_installation_status AS ENUM ('installed', 'failed');
CREATE TYPE public.starter_pack_installation_action AS ENUM ('install', 'reinstall', 'update');

CREATE TABLE public.starter_pack_installations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sport_space_id uuid NOT NULL REFERENCES public.sport_spaces(id) ON DELETE CASCADE,
  pack_id text NOT NULL,
  pack_version text NOT NULL,
  pack_checksum text NOT NULL,
  status public.starter_pack_installation_status NOT NULL DEFAULT 'installed',
  catalog_id uuid REFERENCES public.metric_catalogs(id) ON DELETE SET NULL,
  catalog_version_id uuid REFERENCES public.catalog_versions(id) ON DELETE SET NULL,
  installed_by uuid,
  installed_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (sport_space_id, pack_id)
);

CREATE TABLE public.starter_pack_installation_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  installation_id uuid REFERENCES public.starter_pack_installations(id) ON DELETE CASCADE,
  sport_space_id uuid NOT NULL REFERENCES public.sport_spaces(id) ON DELETE CASCADE,
  pack_id text NOT NULL,
  action public.starter_pack_installation_action NOT NULL,
  status public.starter_pack_installation_status NOT NULL,
  from_version text,
  to_version text NOT NULL,
  catalog_version_id uuid,
  message text,
  actor_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX starter_pack_installations_space_idx ON public.starter_pack_installations (sport_space_id);
CREATE INDEX starter_pack_events_space_idx ON public.starter_pack_installation_events (sport_space_id, created_at DESC);

GRANT SELECT, INSERT, UPDATE ON public.starter_pack_installations TO authenticated;
GRANT ALL ON public.starter_pack_installations TO service_role;
GRANT SELECT, INSERT ON public.starter_pack_installation_events TO authenticated;
GRANT ALL ON public.starter_pack_installation_events TO service_role;

ALTER TABLE public.starter_pack_installations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.starter_pack_installation_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY starter_pack_installations_select ON public.starter_pack_installations
  FOR SELECT TO authenticated USING (public.can_access_space(sport_space_id));
CREATE POLICY starter_pack_installations_insert ON public.starter_pack_installations
  FOR INSERT TO authenticated WITH CHECK (public.can_access_space(sport_space_id));
CREATE POLICY starter_pack_installations_update ON public.starter_pack_installations
  FOR UPDATE TO authenticated USING (public.can_access_space(sport_space_id))
  WITH CHECK (public.can_access_space(sport_space_id));

CREATE POLICY starter_pack_events_select ON public.starter_pack_installation_events
  FOR SELECT TO authenticated USING (public.can_access_space(sport_space_id));
CREATE POLICY starter_pack_events_insert ON public.starter_pack_installation_events
  FOR INSERT TO authenticated WITH CHECK (public.can_access_space(sport_space_id));

CREATE TRIGGER starter_pack_installations_updated_at
  BEFORE UPDATE ON public.starter_pack_installations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- El historial es inmutable.
CREATE TRIGGER starter_pack_events_forbid_delete
  BEFORE DELETE ON public.starter_pack_installation_events
  FOR EACH ROW EXECUTE FUNCTION public.forbid_delete();

CREATE OR REPLACE FUNCTION public.forbid_update_events()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN RAISE EXCEPTION 'El historial de instalaciones es inmutable'; END; $$;

CREATE TRIGGER starter_pack_events_forbid_update
  BEFORE UPDATE ON public.starter_pack_installation_events
  FOR EACH ROW EXECUTE FUNCTION public.forbid_update_events();

/*
 * Instalación transaccional de un Starter Pack.
 * Recibe un plan ya validado y compilado por el dominio; se ejecuta como el
 * usuario llamante (RLS + Membership siguen siendo la única autorización).
 * Nunca modifica filas existentes: sólo crea lo que falta.
 */
CREATE OR REPLACE FUNCTION public.install_starter_pack(
  _sport_space_id uuid,
  _plan jsonb,
  _force boolean DEFAULT false
) RETURNS jsonb
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_pack_id text := _plan ->> 'packId';
  v_version text := _plan ->> 'version';
  v_checksum text := _plan ->> 'checksum';
  v_install public.starter_pack_installations%ROWTYPE;
  v_action public.starter_pack_installation_action;
  v_from_version text;
  v_sport_id uuid;
  v_catalog_id uuid;
  v_version_id uuid;
  v_version_number integer;
  v_profile_id uuid;
  v_metric_id uuid;
  item jsonb;
  w jsonb;
  v_groups integer := 0;
  v_metrics integer := 0;
  v_formulas integer := 0;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'No autenticado'; END IF;
  IF NOT public.can_access_space(_sport_space_id) THEN
    RAISE EXCEPTION 'No perteneces a este SportSpace';
  END IF;
  IF v_pack_id IS NULL OR v_version IS NULL OR v_checksum IS NULL THEN
    RAISE EXCEPTION 'Plan de instalación no válido';
  END IF;

  SELECT * INTO v_install FROM public.starter_pack_installations
   WHERE sport_space_id = _sport_space_id AND pack_id = v_pack_id
   FOR UPDATE;

  IF FOUND AND v_install.status = 'installed' THEN
    IF v_install.pack_version = v_version AND NOT _force THEN
      -- Idempotencia: misma versión ya instalada, no se crea nada.
      RETURN jsonb_build_object(
        'action', 'noop',
        'packId', v_pack_id,
        'version', v_version,
        'catalogId', v_install.catalog_id,
        'catalogVersionId', v_install.catalog_version_id,
        'groups', 0, 'metrics', 0, 'formulas', 0);
    END IF;
    v_action := CASE WHEN v_install.pack_version = v_version THEN 'reinstall' ELSE 'update' END;
    v_from_version := v_install.pack_version;
  ELSE
    v_action := 'install';
  END IF;

  -- 1. Deporte visible con el mismo código, o alta.
  SELECT id INTO v_sport_id FROM public.sports WHERE code = _plan -> 'sport' ->> 'code' LIMIT 1;
  IF v_sport_id IS NULL THEN
    INSERT INTO public.sports (code, name, sport_space_id, owner_id)
    VALUES (_plan -> 'sport' ->> 'code', _plan -> 'sport' ->> 'name', _sport_space_id, v_user)
    RETURNING id INTO v_sport_id;
  END IF;

  -- 2. Catálogo: se reutiliza el de la instalación previa; si hay otro con el
  --    mismo código creado por el usuario, se aborta sin tocar nada.
  IF v_install.catalog_id IS NOT NULL THEN
    v_catalog_id := v_install.catalog_id;
  ELSE
    SELECT id INTO v_catalog_id FROM public.metric_catalogs
     WHERE sport_space_id = _sport_space_id AND code = _plan -> 'catalog' ->> 'code' LIMIT 1;
    IF v_catalog_id IS NOT NULL THEN
      RAISE EXCEPTION 'Ya existe un catálogo con el código "%" en este SportSpace', _plan -> 'catalog' ->> 'code';
    END IF;
    INSERT INTO public.metric_catalogs (sport_space_id, owner_id, sport_id, code, name, description)
    VALUES (_sport_space_id, v_user, v_sport_id, _plan -> 'catalog' ->> 'code',
            _plan -> 'catalog' ->> 'name', _plan -> 'catalog' ->> 'description')
    RETURNING id INTO v_catalog_id;
  END IF;

  -- 3. Grupos que falten (nunca se actualizan los existentes).
  FOR item IN SELECT * FROM jsonb_array_elements(_plan -> 'groups') LOOP
    IF NOT EXISTS (SELECT 1 FROM public.metric_groups
                    WHERE catalog_id = v_catalog_id AND code = item ->> 'code') THEN
      INSERT INTO public.metric_groups (catalog_id, code, name, color, icon, sort_order)
      VALUES (v_catalog_id, item ->> 'code', item ->> 'name', item ->> 'color', item ->> 'icon',
              COALESCE((item ->> 'sortOrder')::int, 0));
      v_groups := v_groups + 1;
    END IF;
  END LOOP;

  -- 4. Métricas que falten.
  FOR item IN SELECT * FROM jsonb_array_elements(_plan -> 'metrics') LOOP
    IF NOT EXISTS (SELECT 1 FROM public.metrics
                    WHERE catalog_id = v_catalog_id AND code = item ->> 'code') THEN
      INSERT INTO public.metrics (catalog_id, group_id, code, name, nature, value_type,
                                  direction, scope, unit, short_description)
      VALUES (v_catalog_id,
              (SELECT id FROM public.metric_groups
                WHERE catalog_id = v_catalog_id AND code = item ->> 'group'),
              item ->> 'code', item ->> 'name',
              (item ->> 'nature')::public.metric_nature,
              (item ->> 'valueType')::public.metric_value_type,
              (item ->> 'direction')::public.metric_direction,
              (item ->> 'scope')::public.subject_scope,
              item ->> 'unit', item ->> 'shortDescription');
      v_metrics := v_metrics + 1;
    END IF;
  END LOOP;

  -- 5. Nueva versión en borrador: el contenido publicado nunca se altera.
  SELECT COALESCE(MAX(version_number), 0) + 1 INTO v_version_number
    FROM public.catalog_versions WHERE catalog_id = v_catalog_id;
  INSERT INTO public.catalog_versions (catalog_id, version_number, change_reason, created_by)
  VALUES (v_catalog_id, v_version_number,
          format('%s del Starter Pack "%s" v%s', v_action, _plan ->> 'packName', v_version), v_user)
  RETURNING id INTO v_version_id;

  -- 6. Fórmulas de la nueva versión.
  FOR item IN SELECT * FROM jsonb_array_elements(_plan -> 'formulas') LOOP
    SELECT id INTO v_metric_id FROM public.metrics
     WHERE catalog_id = v_catalog_id AND code = item ->> 'metric';
    IF v_metric_id IS NULL THEN
      RAISE EXCEPTION 'La métrica "%" del pack no existe en el catálogo', item ->> 'metric';
    END IF;
    INSERT INTO public.metric_formulas (version_id, metric_id, expression, ast, dependencies, null_policy)
    VALUES (v_version_id, v_metric_id, item ->> 'expression', item -> 'ast',
            ARRAY(SELECT jsonb_array_elements_text(item -> 'dependencies')),
            item ->> 'nullPolicy');
    v_formulas := v_formulas + 1;
  END LOOP;

  -- 7. Perfiles de valoración y pesos de la nueva versión.
  FOR item IN SELECT * FROM jsonb_array_elements(_plan -> 'profiles') LOOP
    SELECT id INTO v_profile_id FROM public.valuation_profiles
     WHERE catalog_id = v_catalog_id AND code = item ->> 'code';
    IF v_profile_id IS NULL THEN
      INSERT INTO public.valuation_profiles (catalog_id, code, name, description)
      VALUES (v_catalog_id, item ->> 'code', item ->> 'name', item ->> 'description')
      RETURNING id INTO v_profile_id;
    END IF;

    FOR w IN SELECT * FROM jsonb_array_elements(item -> 'weights') LOOP
      SELECT id INTO v_metric_id FROM public.metrics
       WHERE catalog_id = v_catalog_id AND code = w ->> 'metric';
      IF v_metric_id IS NULL THEN
        RAISE EXCEPTION 'La métrica "%" del perfil no existe en el catálogo', w ->> 'metric';
      END IF;
      INSERT INTO public.metric_weights (version_id, profile_id, metric_id, weight, sign)
      VALUES (v_version_id, v_profile_id, v_metric_id, (w ->> 'weight')::numeric, (w ->> 'sign')::smallint);
    END LOOP;
  END LOOP;

  -- 8. Estado de instalación (una fila por pack y SportSpace).
  INSERT INTO public.starter_pack_installations
    (sport_space_id, pack_id, pack_version, pack_checksum, status, catalog_id, catalog_version_id, installed_by)
  VALUES (_sport_space_id, v_pack_id, v_version, v_checksum, 'installed', v_catalog_id, v_version_id, v_user)
  ON CONFLICT (sport_space_id, pack_id) DO UPDATE
    SET pack_version = EXCLUDED.pack_version,
        pack_checksum = EXCLUDED.pack_checksum,
        status = 'installed',
        catalog_id = EXCLUDED.catalog_id,
        catalog_version_id = EXCLUDED.catalog_version_id,
        installed_by = EXCLUDED.installed_by,
        installed_at = now()
  RETURNING * INTO v_install;

  -- 9. Historial.
  INSERT INTO public.starter_pack_installation_events
    (installation_id, sport_space_id, pack_id, action, status, from_version, to_version, catalog_version_id, actor_id)
  VALUES (v_install.id, _sport_space_id, v_pack_id, v_action, 'installed', v_from_version, v_version, v_version_id, v_user);

  RETURN jsonb_build_object(
    'action', v_action,
    'packId', v_pack_id,
    'version', v_version,
    'catalogId', v_catalog_id,
    'catalogVersionId', v_version_id,
    'groups', v_groups,
    'metrics', v_metrics,
    'formulas', v_formulas);
END; $$;

REVOKE ALL ON FUNCTION public.install_starter_pack(uuid, jsonb, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.install_starter_pack(uuid, jsonb, boolean) TO authenticated;
REVOKE ALL ON FUNCTION public.forbid_update_events() FROM PUBLIC;