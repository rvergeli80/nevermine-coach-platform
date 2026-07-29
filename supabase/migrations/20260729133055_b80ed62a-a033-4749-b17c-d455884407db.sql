-- can_access_space se evalúa también en WITH CHECK de escrituras cuyo BEFORE
-- trigger acaba de crear el SportSpace y la membresía del autor. Como función
-- STABLE usaba la instantánea de la sentencia y no veía esas filas, rechazando
-- la primera escritura de un usuario sin espacio. VOLATILE toma instantánea
-- fresca en cada llamada. La semántica de autorización no cambia.
CREATE OR REPLACE FUNCTION public.can_access_space(_sport_space_id uuid)
RETURNS boolean LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path = public AS $$
  SELECT _sport_space_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.sport_space_members m
    WHERE m.sport_space_id = _sport_space_id AND m.user_id = auth.uid()
  );
$$;

COMMENT ON FUNCTION public.can_access_space(uuid) IS
  'FEATURE-002.4: predicado de acceso por Membership. VOLATILE para reconocer el SportSpace creado por el trigger de la propia sentencia.';
