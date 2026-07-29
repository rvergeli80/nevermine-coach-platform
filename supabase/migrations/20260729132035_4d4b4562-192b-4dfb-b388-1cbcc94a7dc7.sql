-- FEATURE-002.4 — Consolidación: la autorización depende sólo de Membership.

-- 1. sport_spaces: se elimina el acceso permanente por `created_by`.
--    Se conserva únicamente la ventana de arranque (espacio sin miembros aún),
--    imprescindible para que el creador pueda registrarse como Owner.
DROP POLICY IF EXISTS sport_spaces_select ON public.sport_spaces;
CREATE POLICY sport_spaces_select ON public.sport_spaces
  FOR SELECT TO authenticated
  USING (
    public.is_sport_space_member(id)
    OR public.can_bootstrap_sport_space_membership(id)
  );

-- 2. Documentación del modelo de autorización vigente.
COMMENT ON FUNCTION public.can_access_space(uuid) IS
  'FEATURE-002.4: única puerta de acceso a datos de un SportSpace. Requiere Membership. owner_id/created_by no intervienen.';
COMMENT ON FUNCTION public.can_admin_space(uuid) IS
  'FEATURE-002.4: administración del SportSpace, reservada al rol Owner (Membership).';
COMMENT ON FUNCTION public.can_bootstrap_sport_space_membership(uuid) IS
  'Ventana de arranque: el creador de un SportSpace sin miembros puede leerlo y registrarse como Owner. Se cierra en cuanto existe la primera membresía.';

COMMENT ON COLUMN public.seasons.sport_space_id IS
  'FEATURE-002.4: unidad de aislamiento y única base de autorización (Membership + RLS).';
COMMENT ON COLUMN public.sport_spaces.created_by IS
  'Dato histórico de auditoría. No concede permisos salvo la ventana de arranque previa a la primera membresía.';
