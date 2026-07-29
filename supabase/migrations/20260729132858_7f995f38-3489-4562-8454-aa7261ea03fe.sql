-- FEATURE-002.4 — La pertenencia del dato debe coincidir con la autorización.
-- Antes: sport_space_id se derivaba de owner_id (modelo antiguo), de modo que un
-- Coach invitado generaba un espacio personal nuevo y la política WITH CHECK
-- (can_access_space) rechazaba su propia escritura.

CREATE OR REPLACE FUNCTION public.resolve_sport_space_for_user(_user_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE space_id uuid; n integer;
BEGIN
  IF _user_id IS NULL THEN RETURN NULL; END IF;

  SELECT count(*) INTO n FROM public.sport_space_members m WHERE m.user_id = _user_id;

  IF n = 1 THEN
    SELECT m.sport_space_id INTO space_id
      FROM public.sport_space_members m WHERE m.user_id = _user_id;
    RETURN space_id;
  END IF;

  IF n > 1 THEN
    -- Varias pertenencias: se prioriza aquella en la que es Owner (determinista).
    SELECT m.sport_space_id INTO space_id
      FROM public.sport_space_members m
      JOIN public.sport_spaces s ON s.id = m.sport_space_id
     WHERE m.user_id = _user_id
     ORDER BY (m.role <> 'owner'), s.created_at, s.id
     LIMIT 1;
    RETURN space_id;
  END IF;

  -- Sin pertenencias: espacio personal (caso residual; en el alta ya se crea).
  RETURN public.ensure_personal_sport_space(_user_id);
END; $$;

REVOKE ALL ON FUNCTION public.resolve_sport_space_for_user(uuid) FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION public.resolve_sport_space_for_user(uuid) IS
  'FEATURE-002.4: resuelve el SportSpace de una escritura a partir de la pertenencia del autor, no de owner_id.';

CREATE OR REPLACE FUNCTION public.sync_sport_space_id()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.owner_id IS NULL THEN
    RETURN NEW; -- recurso de plataforma: sin SportSpace.
  END IF;
  IF NEW.sport_space_id IS NULL THEN
    NEW.sport_space_id := public.resolve_sport_space_for_user(auth.uid());
    IF NEW.sport_space_id IS NULL THEN
      NEW.sport_space_id := public.resolve_sport_space_for_user(NEW.owner_id);
    END IF;
  END IF;
  RETURN NEW;
END; $$;

-- Alta de usuario: se prepara su espacio personal para que ninguna escritura
-- tenga que crearlo (y su membresía) a mitad de sentencia.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data ->> 'full_name', NEW.raw_user_meta_data ->> 'name'))
  ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'coach')
  ON CONFLICT (user_id, role) DO NOTHING;
  PERFORM public.ensure_personal_sport_space(NEW.id);
  RETURN NEW;
END; $$;
