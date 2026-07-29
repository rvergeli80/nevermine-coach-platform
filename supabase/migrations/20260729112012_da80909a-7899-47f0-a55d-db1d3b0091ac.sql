CREATE TYPE public.sport_space_type AS ENUM ('club', 'federation', 'academy', 'personal');

CREATE TABLE public.sport_spaces (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  name text NOT NULL,
  description text,
  type public.sport_space_type NOT NULL DEFAULT 'club',
  status public.entity_status NOT NULL DEFAULT 'active',
  created_by uuid NOT NULL DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT sport_spaces_slug_format CHECK (slug ~ '^[a-z][a-z0-9-]{1,39}$'),
  CONSTRAINT sport_spaces_name_length CHECK (char_length(btrim(name)) BETWEEN 2 AND 120)
);

GRANT SELECT, INSERT, UPDATE ON public.sport_spaces TO authenticated;
GRANT ALL ON public.sport_spaces TO service_role;

ALTER TABLE public.sport_spaces ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sport_spaces_select_own" ON public.sport_spaces
  FOR SELECT TO authenticated
  USING (created_by = auth.uid());

CREATE POLICY "sport_spaces_insert_own" ON public.sport_spaces
  FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid());

CREATE POLICY "sport_spaces_update_own" ON public.sport_spaces
  FOR UPDATE TO authenticated
  USING (created_by = auth.uid())
  WITH CHECK (created_by = auth.uid());

CREATE INDEX sport_spaces_created_by_idx ON public.sport_spaces (created_by);

CREATE TRIGGER sport_spaces_set_updated_at
  BEFORE UPDATE ON public.sport_spaces
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER sport_spaces_forbid_delete
  BEFORE DELETE ON public.sport_spaces
  FOR EACH ROW EXECUTE FUNCTION public.forbid_delete();