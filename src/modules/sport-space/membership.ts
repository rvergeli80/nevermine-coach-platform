import {
  MEMBERSHIP_ROLES,
  type Membership,
  type MembershipRole,
  type NewMembership,
} from "./membership-types";

/**
 * Invariantes del agregado Membership (FEATURE-002.2). Capa pura: la
 * persistencia replica estas reglas con restricciones y triggers, pero la
 * fuente de verdad conceptual vive aquí.
 */

export function isMembershipRole(value: unknown): value is MembershipRole {
  return MEMBERSHIP_ROLES.includes(value as MembershipRole);
}

/** Comprueba las invariantes de una membresía nueva frente a las existentes. */
export function checkNewMembership(
  input: NewMembership,
  existing: readonly Pick<Membership, "userId" | "role">[],
): string[] {
  const issues: string[] = [];

  if (!isMembershipRole(input.role)) {
    issues.push("Rol de membresía no soportado.");
  }
  if (existing.some((m) => m.userId === input.userId)) {
    issues.push("El usuario ya pertenece a este SportSpace.");
  }
  if (existing.length === 0 && input.role !== "owner") {
    issues.push("El primer miembro de un SportSpace debe ser Owner.");
  }

  return issues;
}

export function countOwners(members: readonly Pick<Membership, "role">[]): number {
  return members.filter((m) => m.role === "owner").length;
}

/** Un SportSpace debe conservar siempre al menos un Owner. */
export function canRemoveMembership(
  membershipId: string,
  members: readonly Pick<Membership, "id" | "role">[],
): boolean {
  const target = members.find((m) => m.id === membershipId);
  if (!target) return false;
  if (target.role !== "owner") return true;
  return countOwners(members) > 1;
}

/** Degradar a un Owner sólo es posible si queda otro Owner. */
export function canChangeMembershipRole(
  membershipId: string,
  nextRole: MembershipRole,
  members: readonly Pick<Membership, "id" | "role">[],
): boolean {
  const target = members.find((m) => m.id === membershipId);
  if (!target) return false;
  if (target.role === "owner" && nextRole !== "owner") return countOwners(members) > 1;
  return true;
}

/** Sólo un Owner administra la composición del SportSpace. */
export function canManageMembers(
  members: readonly Pick<Membership, "userId" | "role">[],
  userId: string,
): boolean {
  return members.some((m) => m.userId === userId && m.role === "owner");
}

export function isMemberOf(
  members: readonly Pick<Membership, "userId">[],
  userId: string,
): boolean {
  return members.some((m) => m.userId === userId);
}
