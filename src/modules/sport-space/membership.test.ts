import { describe, expect, it } from "vitest";

import {
  canChangeMembershipRole,
  canManageMembers,
  canRemoveMembership,
  checkNewMembership,
  countOwners,
  isMemberOf,
  isMembershipRole,
} from "./membership";
import type { Membership } from "./membership-types";

const SPACE_A = "11111111-1111-4111-8111-111111111111";
const SPACE_B = "22222222-2222-4222-8222-222222222222";
const USER_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const USER_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

function member(
  id: string,
  userId: string,
  role: Membership["role"],
  sportSpaceId = SPACE_A,
): Membership {
  return {
    id,
    sportSpaceId,
    userId,
    role,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
  };
}

describe("Membership — creación", () => {
  it("acepta la primera membresía si es Owner", () => {
    expect(
      checkNewMembership({ sportSpaceId: SPACE_A, userId: USER_A, role: "owner" }, []),
    ).toEqual([]);
  });

  it("rechaza que la primera membresía sea Coach", () => {
    const issues = checkNewMembership(
      { sportSpaceId: SPACE_A, userId: USER_A, role: "coach" },
      [],
    );
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatch(/Owner/);
  });

  it("rechaza duplicados dentro del mismo SportSpace", () => {
    const issues = checkNewMembership(
      { sportSpaceId: SPACE_A, userId: USER_A, role: "coach" },
      [member("m1", USER_A, "owner")],
    );
    expect(issues).toContain("El usuario ya pertenece a este SportSpace.");
  });

  it("permite que un usuario pertenezca a varios SportSpaces", () => {
    const otherSpace = [member("m1", USER_A, "owner", SPACE_B)];
    expect(
      checkNewMembership(
        { sportSpaceId: SPACE_A, userId: USER_A, role: "owner" },
        otherSpace.filter((m) => m.sportSpaceId === SPACE_A),
      ),
    ).toEqual([]);
  });

  it("permite múltiples miembros en un SportSpace", () => {
    expect(
      checkNewMembership({ sportSpaceId: SPACE_A, userId: USER_B, role: "coach" }, [
        member("m1", USER_A, "owner"),
      ]),
    ).toEqual([]);
  });

  it("rechaza roles no soportados", () => {
    expect(isMembershipRole("viewer")).toBe(false);
    expect(isMembershipRole("owner")).toBe(true);
  });
});

describe("Membership — invariante de Owner", () => {
  const members = [member("m1", USER_A, "owner"), member("m2", USER_B, "coach")];

  it("cuenta los Owners", () => {
    expect(countOwners(members)).toBe(1);
  });

  it("no permite eliminar al último Owner", () => {
    expect(canRemoveMembership("m1", members)).toBe(false);
  });

  it("permite eliminar a un Coach", () => {
    expect(canRemoveMembership("m2", members)).toBe(true);
  });

  it("permite eliminar un Owner si queda otro", () => {
    const two = [member("m1", USER_A, "owner"), member("m2", USER_B, "owner")];
    expect(canRemoveMembership("m1", two)).toBe(true);
  });

  it("no permite degradar al último Owner", () => {
    expect(canChangeMembershipRole("m1", "coach", members)).toBe(false);
    expect(canChangeMembershipRole("m1", "owner", members)).toBe(true);
    expect(canChangeMembershipRole("m2", "owner", members)).toBe(true);
  });
});

describe("Membership — autorización", () => {
  const members = [member("m1", USER_A, "owner"), member("m2", USER_B, "coach")];

  it("sólo un Owner administra los miembros", () => {
    expect(canManageMembers(members, USER_A)).toBe(true);
    expect(canManageMembers(members, USER_B)).toBe(false);
  });

  it("detecta la pertenencia", () => {
    expect(isMemberOf(members, USER_B)).toBe(true);
    expect(isMemberOf(members, "cccccccc-cccc-4ccc-8ccc-cccccccccccc")).toBe(false);
  });
});
