-- FEATURE-003.5 — Installation Manifest sobre las instalaciones de packs.
ALTER TYPE public.starter_pack_installation_status ADD VALUE IF NOT EXISTS 'uninstalled';
ALTER TYPE public.starter_pack_installation_action ADD VALUE IF NOT EXISTS 'uninstall';
ALTER TYPE public.starter_pack_installation_action ADD VALUE IF NOT EXISTS 'rollback';

ALTER TABLE public.starter_pack_installations
  ADD COLUMN IF NOT EXISTS publisher text,
  ADD COLUMN IF NOT EXISTS trust_level text,
  ADD COLUMN IF NOT EXISTS lifecycle_state text,
  ADD COLUMN IF NOT EXISTS previous_version text;

COMMENT ON COLUMN public.starter_pack_installations.publisher IS 'FEATURE-003.5 — Publisher propietario del paquete instalado.';
COMMENT ON COLUMN public.starter_pack_installations.trust_level IS 'FEATURE-003.5 — Nivel de confianza del paquete instalado.';
COMMENT ON COLUMN public.starter_pack_installations.lifecycle_state IS 'FEATURE-003.5 — Estado de ciclo de vida en el momento de instalar.';
COMMENT ON COLUMN public.starter_pack_installations.previous_version IS 'FEATURE-003.5 — Versión anterior; habilita el rollback determinista.';