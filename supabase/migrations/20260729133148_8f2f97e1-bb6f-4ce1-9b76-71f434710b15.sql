-- Inicializa el Owner de los SportSpaces sin membresías (invariante FEATURE-002.3).
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT s.id FROM public.sport_spaces s
           LEFT JOIN public.sport_space_members m ON m.sport_space_id = s.id
           WHERE m.id IS NULL LOOP
    PERFORM public.ensure_sport_space_owner(r.id);
  END LOOP;
END $$;
