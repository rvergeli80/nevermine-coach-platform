ALTER TYPE public.sport_space_type ADD VALUE IF NOT EXISTS 'company';
ALTER TYPE public.sport_space_type ADD VALUE IF NOT EXISTS 'other';
COMMENT ON COLUMN public.sport_spaces.created_by IS 'Usuario autenticado que ejecuto la creacion del SportSpace. NO implica propiedad: la propiedad se determinara por Membership con rol Owner (FEATURE-002.2).';