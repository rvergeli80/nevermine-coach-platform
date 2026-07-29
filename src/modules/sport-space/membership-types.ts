/**
 * Agregado Membership (FEATURE-002.2).
 *
 * Relación entre un usuario y un SportSpace con un rol determinado. Capa de
 * dominio pura: sin Supabase, React ni infraestructura.
 *
 * Roles MVP: Owner y Coach. El modelo se amplía añadiendo valores al Value
 * Object, sin cambios estructurales (ARCH-001).
 */

export type MembershipRole = "owner" | "coach";

export const MEMBERSHIP_ROLES: readonly MembershipRole[] = ["owner", "coach"];

export const MEMBERSHIP_ROLE_LABELS: Record<MembershipRole, string> = {
  owner: "Propietario",
  coach: "Entrenador",
};

export interface Membership {
  id: string;
  sportSpaceId: string;
  userId: string;
  role: MembershipRole;
  createdAt: string;
  updatedAt: string;
}

/** Datos necesarios para crear una membresía, antes de persistirla. */
export interface NewMembership {
  sportSpaceId: string;
  userId: string;
  role: MembershipRole;
}
