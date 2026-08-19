-- FEATURE-004.2 — Tipos de evento operativos (Partido / Entrenamiento)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'session_kind') THEN
    CREATE TYPE public.session_kind AS ENUM ('match', 'training', 'other');
  END IF;
END $$;

ALTER TABLE public.event_types
  ADD COLUMN IF NOT EXISTS session_kind public.session_kind NOT NULL DEFAULT 'other';

CREATE UNIQUE INDEX IF NOT EXISTS event_types_sport_kind_unique
  ON public.event_types (sport_id, session_kind)
  WHERE session_kind <> 'other';

-- Aprovisionamiento canónico: cada deporte dispone de Partido y Entrenamiento.
CREATE OR REPLACE FUNCTION public.provision_sport_event_types(_sport_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.event_types (sport_id, code, name, status, session_kind)
  VALUES (_sport_id, 'match', 'Partido', 'active', 'match')
  ON CONFLICT DO NOTHING;

  INSERT INTO public.event_types (sport_id, code, name, status, session_kind)
  VALUES (_sport_id, 'training', 'Entrenamiento', 'active', 'training')
  ON CONFLICT DO NOTHING;
END $$;

CREATE OR REPLACE FUNCTION public.provision_event_types_for_new_sport()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.provision_sport_event_types(NEW.id);
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS sports_provision_event_types ON public.sports;
CREATE TRIGGER sports_provision_event_types
AFTER INSERT ON public.sports
FOR EACH ROW EXECUTE FUNCTION public.provision_event_types_for_new_sport();

-- Backfill para los deportes ya existentes (no modifica ni borra datos previos).
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT id FROM public.sports LOOP
    PERFORM public.provision_sport_event_types(r.id);
  END LOOP;
END $$;