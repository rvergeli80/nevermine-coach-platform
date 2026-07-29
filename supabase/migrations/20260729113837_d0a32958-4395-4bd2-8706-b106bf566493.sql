-- FEATURE-002.2 — Membership

CREATE TYPE public.sport_space_role AS ENUM ('owner', 'coach');

CREATE TABLE public.sport_space_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sport_space_id uuid NOT NULL REFERENCES public.sport_spaces(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.sport_space_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT sport_space_members_unique UNIQUE (sport_space_id, user_id)
);

CREATE INDEX sport_space_members_space_idx ON public.sport_space_members (sport_space_id);
CREATE INDEX sport_space_members_user_idx ON public.sport_space_members (user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.sport_space_members TO authenticated;
GRANT ALL ON public.sport_space_members TO service_role;

ALTER TABLE public.sport_space_members ENABLE ROW LEVEL SECURITY;

-- Funciones SECURITY DEFINER: evitan recursión de RLS al consultar la propia tabla.
CREATE OR REPLACE FUNCTION public.is_sport_space_member(_sport_space_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.sport_space_members m
    WHERE m.sport_space_id = _sport_space_id AND m.user_id = auth.uid()
  );
$$;

CREATE OR REPLACE FUNCTION public.is_sport_space_owner(_sport_space_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.sport_space_members m
    WHERE m.sport_space_id = _sport_space_id
      AND m.user_id = auth.uid()
      AND m.role = 'owner'
  );
$$;

-- Arranque: mientras el SportSpace no tenga ningún miembro, quien lo creó puede
-- darse de alta a sí mismo como Owner. No implica propiedad fuera de Membership.
CREATE OR REPLACE FUNCTION public.can_bootstrap_sport_space_membership(_sport_space_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.sport_spaces s
    WHERE s.id = _sport_space_id AND s.created_by = auth.uid()
  ) AND NOT EXISTS (
    SELECT 1 FROM public.sport_space_members m WHERE m.sport_space_id = _sport_space_id
  );
$$;

CREATE POLICY "Miembros ven las membresías de su SportSpace"
  ON public.sport_space_members FOR SELECT TO authenticated
  USING (public.is_sport_space_member(sport_space_id) OR user_id = auth.uid());

CREATE POLICY "Owners añaden miembros"
  ON public.sport_space_members FOR INSERT TO authenticated
  WITH CHECK (
    public.is_sport_space_owner(sport_space_id)
    OR (public.can_bootstrap_sport_space_membership(sport_space_id)
        AND user_id = auth.uid()
        AND role = 'owner')
  );

CREATE POLICY "Owners actualizan miembros"
  ON public.sport_space_members FOR UPDATE TO authenticated
  USING (public.is_sport_space_owner(sport_space_id))
  WITH CHECK (public.is_sport_space_owner(sport_space_id));

CREATE POLICY "Owners eliminan miembros"
  ON public.sport_space_members FOR DELETE TO authenticated
  USING (public.is_sport_space_owner(sport_space_id));

-- Invariante: el primer miembro de un SportSpace siempre es Owner.
CREATE OR REPLACE FUNCTION public.enforce_first_member_is_owner()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.role <> 'owner' AND NOT EXISTS (
    SELECT 1 FROM public.sport_space_members m WHERE m.sport_space_id = NEW.sport_space_id
  ) THEN
    RAISE EXCEPTION 'El primer miembro de un SportSpace debe ser Owner';
  END IF;
  RETURN NEW;
END; $$;

CREATE TRIGGER sport_space_members_first_is_owner
  BEFORE INSERT ON public.sport_space_members
  FOR EACH ROW EXECUTE FUNCTION public.enforce_first_member_is_owner();

-- Invariante: no puede eliminarse (ni degradarse) el último Owner.
CREATE OR REPLACE FUNCTION public.enforce_last_owner_remains()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE owners integer;
BEGIN
  IF OLD.role <> 'owner' THEN RETURN COALESCE(NEW, OLD); END IF;
  IF TG_OP = 'UPDATE' AND NEW.role = 'owner' AND NEW.sport_space_id = OLD.sport_space_id THEN
    RETURN NEW;
  END IF;
  SELECT count(*) INTO owners FROM public.sport_space_members m
    WHERE m.sport_space_id = OLD.sport_space_id AND m.role = 'owner';
  IF owners <= 1 THEN
    RAISE EXCEPTION 'Un SportSpace debe conservar al menos un Owner';
  END IF;
  RETURN COALESCE(NEW, OLD);
END; $$;

CREATE TRIGGER sport_space_members_last_owner_delete
  BEFORE DELETE ON public.sport_space_members
  FOR EACH ROW EXECUTE FUNCTION public.enforce_last_owner_remains();

CREATE TRIGGER sport_space_members_last_owner_update
  BEFORE UPDATE ON public.sport_space_members
  FOR EACH ROW EXECUTE FUNCTION public.enforce_last_owner_remains();

CREATE TRIGGER sport_space_members_set_updated_at
  BEFORE UPDATE ON public.sport_space_members
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
