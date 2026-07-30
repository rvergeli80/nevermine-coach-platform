/**
 * FEATURE-003.8 — Tests de integración de la fusión en Coach.
 *
 * Coach no implementa lógica de fusión: aquí se verifica que su adaptador
 * proyecta y reconstruye packs correctamente y que la fusión pasa siempre por
 * el MergeService de la plataforma.
 */

import { describe, expect, it } from "vitest";
import { starterPacks } from "./repository";
import { starterPackMergeAdapter, previewConfigurationMerge, mergeConfigurationVersions } from "./merge";
import { recordConfigurationChange } from "./versioning";
import { configurationVersions } from "./versioning";
import type { StarterPack } from "./types";

const officialPack = starterPacks[0];

function packWithExtraMetric(base: StarterPack, code: string): StarterPack {
  return {
    ...base,
    metrics: [
      ...base.metrics,
      {
        code,
        name: `Métrica ${code}`,
        group: base.groups[0].code,
        nature: "primary",
        valueType: "counter",
        direction: "higher_is_better",
        scope: "individual",
      },
    ],
  };
}

describe("Coach — adaptador de fusión", () => {
  it("reconstruye un pack idéntico al proyectarlo y materializarlo", () => {
    const rebuilt = starterPackMergeAdapter.materialize(officialPack, {
      configuration: starterPackMergeAdapter.configuration(officialPack),
      knowledge: starterPackMergeAdapter.knowledge(officialPack),
    });
    expect(rebuilt.name).toBe(officialPack.name);
    expect(rebuilt.metrics.map((m) => m.code).sort()).toEqual(officialPack.metrics.map((m) => m.code).sort());
    expect(rebuilt.groups.map((g) => g.code).sort()).toEqual(officialPack.groups.map((g) => g.code).sort());
    expect(rebuilt.profiles.map((p) => p.code).sort()).toEqual(officialPack.profiles.map((p) => p.code).sort());
  });
});

describe("Coach — fusión de configuraciones", () => {
  it("previsualiza la incorporación de una métrica nueva sin crear versión", () => {
    const current = configurationVersions.getCurrent(officialPack.id)!;
    const evolved = recordConfigurationChange({
      pack: packWithExtraMetric(current.snapshot, "TEST_PREVIEW"),
      changeType: "minor",
      createdBy: "coach",
      reason: "Añadir métrica de prueba",
      changeSummary: "Nueva métrica",
    });
    expect(evolved.ok).toBe(true);
    if (!evolved.ok) return;

    const historyBefore = configurationVersions.getHistory(officialPack.id).length;
    const preview = previewConfigurationMerge(
      officialPack.id,
      evolved.version.semanticVersion,
      current.semanticVersion,
    );
    expect(preview.ok).toBe(true);
    if (!preview.ok) return;
    expect(preview.result.status).toBe("automatic");
    expect(preview.result.mergedVersion).toBeNull();
    expect(preview.result.mergedSnapshot.metrics.some((m) => m.code === "TEST_PREVIEW")).toBe(true);
    expect(configurationVersions.getHistory(officialPack.id).length).toBe(historyBefore);
  });

  it("una fusión ejecutada crea una versión nueva con procedencia", () => {
    const target = configurationVersions.getCurrent(officialPack.id)!;
    const evolved = recordConfigurationChange({
      pack: packWithExtraMetric(target.snapshot, "TEST_MERGE"),
      changeType: "minor",
      createdBy: "coach",
      reason: "Añadir métrica fusionable",
      changeSummary: "Nueva métrica",
    });
    expect(evolved.ok).toBe(true);
    if (!evolved.ok) return;

    const merged = mergeConfigurationVersions({
      packId: officialPack.id,
      from: evolved.version.semanticVersion,
      to: target.semanticVersion,
      mergeAuthor: "coach",
      reason: "Fusionar métrica nueva",
      changeSummary: "Se incorpora TEST_MERGE",
    });
    expect(merged.ok).toBe(true);
    if (!merged.ok) return;
    const created = merged.result.mergedVersion!;
    expect(created.merge?.mergeId).toBe(merged.result.mergeId);
    expect(created.snapshot.metrics.some((m) => m.code === "TEST_MERGE")).toBe(true);
    // Las versiones de entrada no se han tocado.
    expect(configurationVersions.getVersion(target.versionId)?.snapshot.metrics.some((m) => m.code === "TEST_MERGE")).toBe(false);
  });

  it("informa de versiones inexistentes en lugar de fusionar a ciegas", () => {
    const outcome = previewConfigurationMerge(officialPack.id, "99.0.0", "1.0.0");
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.errors.join(" ")).toContain("no existe");
  });
});
