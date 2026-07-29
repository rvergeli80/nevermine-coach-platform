-- Revierte la creación de espacio personal en el alta: con varias pertenencias
-- desviaba los datos del Coach invitado a su espacio personal.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data ->> 'full_name', NEW.raw_user_meta_data ->> 'name'))
  ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'coach')
  ON CONFLICT (user_id, role) DO NOTHING;
  RETURN NEW;
END; $$;
