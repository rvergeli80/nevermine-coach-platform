import { describe, expect, it } from "vitest";

import {
  canAccessSportSpace,
  canAdminSportSpace,
  checkNewSportSpace,
  isSportSpaceOperable,
  slugifySportSpaceName,
  sportSpaceTypeOrDefault,
} from "./sport-space";
import { createSportSpaceSchema } from "./schemas";
import type { NewSportSpace } from "./types";

const valid: NewSportSpace = {
  slug: "cn-nevermine",
  name: "CN Nevermine",
  description: "Club de waterpolo",
  type: "club",
};

describe("SportSpace — invariantes del agregado", () => {
  it("acepta un SportSpace válido", () => {
    expect(checkNewSportSpace(valid)).toEqual([]);
  });

  it("rechaza nombres demasiado cortos", () => {
    expect(checkNewSportSpace({ ...valid, name: "A" })).toHaveLength(1);
  });

  it("rechaza slugs con mayúsculas, espacios o inicio numérico", () => {
    expect(checkNewSportSpace({ ...valid, slug: "CN Nevermine" })).toHaveLength(1);
    expect(checkNewSportSpace({ ...valid, slug: "1club" })).toHaveLength(1);
    expect(checkNewSportSpace({ ...valid, slug: "c" })).toHaveLength(1);
  });

  it("rechaza descripciones excesivas", () => {
    expect(checkNewSportSpace({ ...valid, description: "x".repeat(501) })).toHaveLength(1);
  });

  it("rechaza tipos no soportados", () => {
    expect(
      checkNewSportSpace({ ...valid, type: "liga" as NewSportSpace["type"] }),
    ).toHaveLength(1);
  });

  it("acumula varios problemas a la vez", () => {
    expect(checkNewSportSpace({ slug: "X", name: "", description: null, type: "club" })).toHaveLength(
      2,
    );
  });
});

describe("SportSpace — slugify", () => {
  it("normaliza acentos y separadores", () => {
    expect(slugifySportSpaceName("Federación Española de Natación")).toBe(
      "federacion-espanola-de-natacion",
    );
  });

  it("garantiza que el slug empieza por letra", () => {
    expect(slugifySportSpaceName("2026 Waterpolo")).toBe("space-2026-waterpolo");
  });

  it("produce siempre un slug válido", () => {
    expect(checkNewSportSpace({ ...valid, slug: slugifySportSpaceName("  Club  Náutico!!  ") })).toEqual(
      [],
    );
  });
});

describe("SportSpace — estado y autorización", () => {
  it("sólo un SportSpace activo es operable", () => {
    expect(isSportSpaceOperable({ status: "active" })).toBe(true);
    expect(isSportSpaceOperable({ status: "inactive" })).toBe(false);
    expect(isSportSpaceOperable({ status: "archived" })).toBe(false);
  });

  it("autoriza el acceso únicamente por Membership (FEATURE-002.4)", () => {
    const memberships = [
      { sportSpaceId: "space-1", userId: "user-a", role: "owner" as const },
      { sportSpaceId: "space-1", userId: "user-b", role: "coach" as const },
    ];
    expect(canAccessSportSpace(memberships, "space-1", "user-a")).toBe(true);
    expect(canAccessSportSpace(memberships, "space-1", "user-b")).toBe(true);
    // Creador sin membresía: sin acceso.
    expect(canAccessSportSpace(memberships, "space-1", "user-c")).toBe(false);
    // Membresía en otro SportSpace: sin acceso.
    expect(canAccessSportSpace(memberships, "space-2", "user-a")).toBe(false);
    // Pérdida de membresía: acceso revocado de inmediato.
    expect(canAccessSportSpace([memberships[0]], "space-1", "user-b")).toBe(false);
  });

  it("reserva la administración al rol Owner", () => {
    const memberships = [
      { sportSpaceId: "space-1", userId: "user-a", role: "owner" as const },
      { sportSpaceId: "space-1", userId: "user-b", role: "coach" as const },
    ];
    expect(canAdminSportSpace(memberships, "space-1", "user-a")).toBe(true);
    expect(canAdminSportSpace(memberships, "space-1", "user-b")).toBe(false);
    expect(canAdminSportSpace(memberships, "space-2", "user-a")).toBe(false);
  });

  it("normaliza tipos desconocidos al valor por defecto", () => {
    expect(sportSpaceTypeOrDefault("federation")).toBe("federation");
    expect(sportSpaceTypeOrDefault("otro")).toBe("club");
    expect(sportSpaceTypeOrDefault(null)).toBe("club");
  });
});

describe("SportSpace — contrato de entrada", () => {
  it("normaliza espacios y aplica el tipo por defecto", () => {
    const parsed = createSportSpaceSchema.parse({
      slug: " cn-nevermine ",
      name: "  CN Nevermine  ",
      description: "   ",
    });
    expect(parsed).toEqual({
      slug: "cn-nevermine",
      name: "CN Nevermine",
      description: null,
      type: "club",
    });
  });

  it("rechaza entradas inválidas", () => {
    expect(() => createSportSpaceSchema.parse({ slug: "Mal Slug", name: "Club" })).toThrow();
  });
});
