-- FEATURE-002.3 — Migración del modelo de propiedad (Dual Write)
-- Idempotente: puede ejecutarse varias veces sin efectos secundarios.
-- No elimina owner_id ni created_by. No modifica RLS.

/* 1. Columna sport_space_id en todas las entidades de negocio ---------------- */

ALTER TABLE public.sports               ADD COLUMN IF NOT EXISTS sport_space_id uuid REFERENCES public.sport_spaces(id) ON DELETE RESTRICT;
ALTER TABLE public.metric_catalogs      ADD COLUMN IF NOT EXISTS sport_space_id uuid REFERENCES public.sport_spaces(id) ON DELETE RESTRICT;
ALTER TABLE public.seasons              ADD COLUMN IF NOT EXISTS sport_space_id uuid REFERENCES public.sport_spaces(id) ON DELETE RESTRICT;
ALTER TABLE public.competitions         ADD COLUMN IF NOT EXISTS sport_space_id uuid REFERENCES public.sport_spaces(id) ON DELETE RESTRICT;
ALTER TABLE public.teams                ADD COLUMN IF NOT EXISTS sport_space_id uuid REFERENCES public.sport_spaces(id) ON DELETE RESTRICT;
ALTER TABLE public.players              ADD COLUMN IF NOT EXISTS sport_space_id uuid REFERENCES public.sport_spaces(id) ON DELETE RESTRICT;
ALTER TABLE public.observation_contexts ADD COLUMN IF NOT EXISTS sport_space_id uuid REFERENCES public.sport_spaces(id) ON DELETE RESTRICT;
ALTER TABLE public.metric_values        ADD COLUMN IF NOT EXISTS sport_space_id uuid REFERENCES public.sport_spaces(id) ON DELETE RESTRICT;
ALTER TABLE public.valuations           ADD COLUMN IF NOT EXISTS sport_space_id uuid REFERENCES public.sport_spaces(id) ON DELETE RESTRICT;
ALTER TABLE public.audit_log            ADD COLUMN IF NOT EXISTS sport_space_id uuid REFERENCES public.sport_spaces(id) ON DELETE RESTRICT;

COMMENT ON COLUMN public.seasons.sport_space_id IS
  'FEATURE-002.3: propiedad organizativa en transición. Se sincroniza automáticamente con owner_id; la autorización sigue usando owner_id hasta FEATURE-002.4.';

CREATE INDEX IF NOT EXISTS idx_sports_sport_space               ON public.sports(sport_space_id);
CREATE INDEX IF NOT EXISTS idx_metric_catalogs_sport_space      ON public.metric_catalogs(sport_space_id);
CREATE INDEX IF NOT EXISTS idx_seasons_sport_space              ON public.seasons(sport_space_id);
CREATE INDEX IF NOT EXISTS idx_competitions_sport_space         ON public.competitions(sport_space_id);
CREATE INDEX IF NOT EXISTS idx_teams_sport_space                ON public.teams(sport_space_id);
CREATE INDEX IF NOT EXISTS idx_players_sport_space              ON public.players(sport_space_id);
CREATE INDEX IF NOT EXISTS idx_observation_contexts_sport_space ON public.observation_contexts(sport_space_id);
CREATE INDEX IF NOT EXISTS idx_metric_values_sport_space        ON public.metric_values(sport_space_id);
CREATE INDEX IF NOT EXISTS idx_valuations_sport_space           ON public.valuations(sport_space_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_sport_space            ON public.audit_log(sport_space_id);

/* 2. Inicialización: todo SportSpace debe tener al menos un Owner ------------ */
/*    Excepción de transición: se usa created_by. Desaparece al cerrar EPIC-002. */

CREATE OR REPLACE FUNCTION public.ensure_sport_space_owner(_sport_space_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE creator uuid;
BEGIN
  IF EXISTS (SELECT 1 FROM public.sport_space_members m WHERE m.sport_space_id = _sport_space_id) THEN
    RETURN;
  END IF;
  SELECT s.created_by INTO creator FROM public.sport_spaces s WHERE s.id = _sport_space_id;
  IF creator IS NULL THEN RETURN; END IF;
  INSERT INTO public.sport_space_members (sport_space_id, user_id, role)
  VALUES (_sport_space_id, creator, 'owner')
  ON CONFLICT (sport_space_id, user_id) DO NOTHING;
END; $$;

DO $$
DECLARE s record;
BEGIN
  FOR s IN SELECT id FROM public.sport_spaces LOOP
    PERFORM public.ensure_sport_space_owner(s.id);
  END LOOP;
END; $$;

/* 3. Resolución del SportSpace de un usuario (personal por defecto) ---------- */

CREATE OR REPLACE FUNCTION public.ensure_personal_sport_space(_user_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE space_id uuid; base_slug text; candidate text; n integer := 0;
BEGIN
  IF _user_id IS NULL THEN RETURN NULL; END IF;

  -- 1) SportSpace donde el usuario ya es Owner (el más antiguo, determinista).
  SELECT m.sport_space_id INTO space_id
  FROM public.sport_space_members m
  JOIN public.sport_spaces s ON s.id = m.sport_space_id
  WHERE m.user_id = _user_id AND m.role = 'owner'
  ORDER BY s.created_at, s.id
  LIMIT 1;
  IF space_id IS NOT NULL THEN RETURN space_id; END IF;

  -- 2) SportSpace creado por el usuario (aún sin membresías).
  SELECT s.id INTO space_id
  FROM public.sport_spaces s
  WHERE s.created_by = _user_id
  ORDER BY s.created_at, s.id
  LIMIT 1;
  IF space_id IS NOT NULL THEN
    PERFORM public.ensure_sport_space_owner(space_id);
    RETURN space_id;
  END IF;

  -- 3) Crear un SportSpace personal.
  -- El slug debe cumplir ^[a-z][a-z0-9-]{1,39}$ (máx. 40 caracteres).
  base_slug := 'personal-' || left(replace(_user_id::text, '-', ''), 24);
  candidate := base_slug;
  WHILE EXISTS (SELECT 1 FROM public.sport_spaces s WHERE s.slug = candidate) LOOP
    n := n + 1;
    candidate := left(base_slug, 33) || '-' || n::text;
  END LOOP;

  INSERT INTO public.sport_spaces (slug, name, description, type, created_by)
  VALUES (candidate, 'Espacio personal',
          'SportSpace personal creado automáticamente durante la migración del modelo de propiedad (FEATURE-002.3).',
          'personal', _user_id)
  RETURNING id INTO space_id;

  INSERT INTO public.sport_space_members (sport_space_id, user_id, role)
  VALUES (space_id, _user_id, 'owner')
  ON CONFLICT (sport_space_id, user_id) DO NOTHING;

  RETURN space_id;
END; $$;

/* 4. Doble escritura: trigger de sincronización owner_id -> sport_space_id --- */

CREATE OR REPLACE FUNCTION public.sync_sport_space_id()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.owner_id IS NULL THEN
    RETURN NEW; -- recurso de plataforma: sin SportSpace.
  END IF;
  IF NEW.sport_space_id IS NULL THEN
    NEW.sport_space_id := public.ensure_personal_sport_space(NEW.owner_id);
  END IF;
  RETURN NEW;
END; $$;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'sports','metric_catalogs','seasons','competitions','teams','players',
    'observation_contexts','metric_values','valuations','audit_log'
  ] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON public.%I', t || '_sync_sport_space', t);
    EXECUTE format(
      'CREATE TRIGGER %I BEFORE INSERT OR UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.sync_sport_space_id()',
      t || '_sync_sport_space', t);
  END LOOP;
END; $$;

/* 5. Backfill idempotente de los recursos existentes ------------------------- */

DO $$
DECLARE t text; sql text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'sports','metric_catalogs','seasons','competitions','teams','players',
    'observation_contexts','metric_values','valuations','audit_log'
  ] LOOP
    sql := format(
      'UPDATE public.%I SET sport_space_id = public.ensure_personal_sport_space(owner_id)
         WHERE owner_id IS NOT NULL AND sport_space_id IS NULL', t);
    EXECUTE sql;
  END LOOP;
END; $$;

/* 6. Integridad: ningún recurso con propietario puede quedar sin SportSpace -- */

DO $$
DECLARE t text; orphans bigint;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'sports','metric_catalogs','seasons','competitions','teams','players',
    'observation_contexts','metric_values','valuations','audit_log'
  ] LOOP
    EXECUTE format('SELECT count(*) FROM public.%I WHERE owner_id IS NOT NULL AND sport_space_id IS NULL', t)
      INTO orphans;
    IF orphans > 0 THEN
      RAISE EXCEPTION 'Migración incompleta: % filas sin sport_space_id en %', orphans, t;
    END IF;
  END LOOP;
END; $$;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'sports','metric_catalogs','seasons','competitions','teams','players',
    'observation_contexts','metric_values','valuations','audit_log'
  ] LOOP
    EXECUTE format(
      'ALTER TABLE public.%I DROP CONSTRAINT IF EXISTS %I', t, t || '_sport_space_sync');
    EXECUTE format(
      'ALTER TABLE public.%I ADD CONSTRAINT %I CHECK (owner_id IS NULL OR sport_space_id IS NOT NULL) NOT VALID',
      t, t || '_sport_space_sync');
    EXECUTE format('ALTER TABLE public.%I VALIDATE CONSTRAINT %I', t, t || '_sport_space_sync');
  END LOOP;
END; $$;