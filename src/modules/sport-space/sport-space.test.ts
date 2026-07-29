import { describe, expect, it } from "vitest";

import {
  canReadSportSpace,
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

  it("aísla la lectura por creador mientras no exista Membership", () => {
    expect(canReadSportSpace({ createdBy: "user-a" }, "user-a")).toBe(true);
    expect(canReadSportSpace({ createdBy: "user-a" }, "user-b")).toBe(false);
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
