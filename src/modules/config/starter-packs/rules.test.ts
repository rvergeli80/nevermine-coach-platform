import { starterPacks } from "./index";
import { checkStarterPack } from "./rules";
import type { StarterPack } from "./types";
import { waterpoloPack } from "./waterpolo";
import { describe, expect, it } from "vitest";

describe("checkStarterPack", () => {
  it("acepta todos los packs registrados", () => {
    for (const pack of starterPacks) {
      expect(checkStarterPack(pack), pack.id).toEqual([]);
    }
  });

  it("rechaza una métrica derivada sin fórmula", () => {
    const pack: StarterPack = {
      ...waterpoloPack,
      metrics: waterpoloPack.metrics.map((m) =>
        m.code === "eficacia_tiro" ? { ...m, formula: undefined } : m,
      ),
    };
    expect(checkStarterPack(pack).some((e) => e.includes("no tiene fórmula"))).toBe(true);
  });

  it("rechaza una fórmula que referencia una métrica inexistente", () => {
    const pack: StarterPack = {
      ...waterpoloPack,
      metrics: waterpoloPack.metrics.map((m) =>
        m.code === "eficacia_tiro" ? { ...m, formula: "goles / inexistente" } : m,
      ),
    };
    expect(checkStarterPack(pack).some((e) => e.includes("eficacia_tiro"))).toBe(true);
  });

  it("rechaza un grupo inexistente", () => {
    const pack: StarterPack = {
      ...waterpoloPack,
      metrics: waterpoloPack.metrics.map((m) =>
        m.code === "goles" ? { ...m, group: "fantasma" } : m,
      ),
    };
    expect(checkStarterPack(pack).some((e) => e.includes("grupo inexistente"))).toBe(true);
  });

  it("rechaza pesos sobre métricas inexistentes o duplicados", () => {
    const pack: StarterPack = {
      ...waterpoloPack,
      profiles: [
        {
          ...waterpoloPack.profiles[0],
          weights: [
            { metric: "goles", weight: 1, sign: 1 },
            { metric: "goles", weight: 2, sign: 1 },
            { metric: "no_existe", weight: 1, sign: -1 },
          ],
        },
      ],
    };
    const errors = checkStarterPack(pack);
    expect(errors.some((e) => e.includes("repite el peso"))).toBe(true);
    expect(errors.some((e) => e.includes("métrica inexistente"))).toBe(true);
  });

  it("rechaza códigos con formato inválido", () => {
    const pack: StarterPack = {
      ...waterpoloPack,
      catalog: { ...waterpoloPack.catalog, code: "Waterpolo Base" },
    };
    expect(checkStarterPack(pack).some((e) => e.includes("Código no válido"))).toBe(true);
  });
});
