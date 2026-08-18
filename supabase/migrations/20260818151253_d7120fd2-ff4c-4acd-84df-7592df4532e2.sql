DO $$
DECLARE
  v_seasons uuid[] := ARRAY[
    '977444bc-543d-4b07-9deb-7834b2902fc6',
    '55564043-0642-4332-95b2-1442b3e19d05',
    '2fb987c7-5c11-4ef6-a178-b732811e5a18',
    '77b37ab4-1ca9-4179-823d-baa46e59e4b0',
    'a5b1f747-9eba-41a0-bac6-96bbcbaa2d3e'
  ]::uuid[];
  v_teams uuid[] := ARRAY[
    'eee4a736-46cd-4fab-a392-357d1fff7ba8',
    '37e8732c-4dfc-4517-b6de-bda5f1c7664d',
    'bfa7555f-e79d-41d3-82b7-1db381bacb6b',
    '83697e5b-82ef-404c-a244-f78303cf4777',
    'cae86863-c2e9-4399-b862-56c8a5645447',
    'cb25544f-a9e1-4ea8-8e4d-7bec1454e898',
    '0a1eb97c-b7a5-4a67-ba23-e5869245907c',
    '0ef2801e-5ae8-49a1-85e0-21f9b54f6f17',
    '14fa303f-ca02-4624-9c7d-6a945c25d366'
  ]::uuid[];
  n integer;
BEGIN
  IF EXISTS (SELECT 1 FROM public.seasons WHERE id = ANY (v_seasons))
     OR EXISTS (SELECT 1 FROM public.teams WHERE id = ANY (v_teams)) THEN

    SELECT count(*) INTO n FROM public.seasons;
    IF n <> 5 THEN RAISE EXCEPTION 'Precondicion fallida: se esperaban 5 temporadas, hay %', n; END IF;
    SELECT count(*) INTO n FROM public.seasons WHERE id = ANY (v_seasons) AND sport_id IS NULL;
    IF n <> 5 THEN RAISE EXCEPTION 'Precondicion fallida: temporadas del inventario no coinciden (%)', n; END IF;

    SELECT count(*) INTO n FROM public.teams;
    IF n <> 9 THEN RAISE EXCEPTION 'Precondicion fallida: se esperaban 9 equipos, hay %', n; END IF;
    SELECT count(*) INTO n FROM public.teams
      WHERE id = ANY (v_teams) AND season_id IS NULL AND category_id IS NULL;
    IF n <> 9 THEN RAISE EXCEPTION 'Precondicion fallida: equipos del inventario no coinciden (%)', n; END IF;

    SELECT count(*) INTO n FROM public.competitions;
    IF n <> 0 THEN RAISE EXCEPTION 'Precondicion fallida: existen % competiciones', n; END IF;
    SELECT count(*) INTO n FROM public.valuations;
    IF n <> 0 THEN RAISE EXCEPTION 'Precondicion fallida: existen % valoraciones', n; END IF;
    SELECT count(*) INTO n FROM public.sport_categories;
    IF n <> 0 THEN RAISE EXCEPTION 'Precondicion fallida: existen % categorias', n; END IF;

    SELECT count(*) INTO n FROM public.players WHERE team_id = ANY (v_teams);
    IF n <> 7 THEN RAISE EXCEPTION 'Precondicion fallida: se esperaban 7 jugadores dependientes, hay %', n; END IF;
    SELECT count(*) INTO n FROM public.observation_contexts WHERE team_id = ANY (v_teams);
    IF n <> 5 THEN RAISE EXCEPTION 'Precondicion fallida: se esperaban 5 contextos dependientes, hay %', n; END IF;
    SELECT count(*) INTO n FROM public.metric_values mv
      JOIN public.observation_contexts oc ON oc.id = mv.context_id
      WHERE oc.team_id = ANY (v_teams);
    IF n <> 2 THEN RAISE EXCEPTION 'Precondicion fallida: se esperaban 2 valores dependientes, hay %', n; END IF;

    DELETE FROM public.metric_values mv
      USING public.observation_contexts oc
      WHERE oc.id = mv.context_id AND oc.team_id = ANY (v_teams);
    DELETE FROM public.observation_contexts WHERE team_id = ANY (v_teams);
    DELETE FROM public.players WHERE team_id = ANY (v_teams);
    DELETE FROM public.teams WHERE id = ANY (v_teams);
    DELETE FROM public.seasons WHERE id = ANY (v_seasons);
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.seasons WHERE sport_id IS NULL) THEN
    RAISE EXCEPTION 'No se puede endurecer: existen temporadas sin sport_id';
  END IF;
  IF EXISTS (SELECT 1 FROM public.teams WHERE season_id IS NULL OR category_id IS NULL) THEN
    RAISE EXCEPTION 'No se puede endurecer: existen equipos sin season_id o category_id';
  END IF;
END $$;

ALTER TABLE public.seasons ALTER COLUMN sport_id SET NOT NULL;
ALTER TABLE public.teams ALTER COLUMN season_id SET NOT NULL;
ALTER TABLE public.teams ALTER COLUMN category_id SET NOT NULL;