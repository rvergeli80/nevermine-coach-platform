import { describe, expect, it } from "vitest";
import { compareAgainstCurrent, compareConfigurationVersions, starterPackProjector } from "./comparison";
import { configurationVersions, recordConfigurationChange } from "./versioning";
import { starterPacks } from "./repository";

/**
 * FEATURE-003.7 — Coach compara exclusivamente a través del ComparisonService
 * de la plataforma y jamás decide por su cuenta: sólo muestra el informe.
 */
describe("FEATURE-003.7 — Comparación de configuraciones en Coach", () => {
  const pack = starterPacks[0];

  it("proyecta métricas, grupos y perfiles como conocimiento con identidad", () => {
    const entities = starterPackProjector.knowledge(pack);
    expect(entities.filter((e) => e.kind === "metric").length).toBe(pack.metrics.length);
    expect(entities.filter((e) => e.kind === "group").length).toBe(pack.groups.length);
    expect(new Set(entities.map((e) => `${e.kind}::${e.id}`)).size).toBe(entities.length);
  });

  it("detecta y explica una métrica eliminada frente a la versión vigente", () => {
    const current = configurationVersions.getCurrent(pack.id);
    expect(current).toBeDefined();

    const removed = pack.metrics[0];
    const created = recordConfigurationChange({
      pack: { ...pack, metrics: pack.metrics.filter((m) => m.code !== removed.code) },
      changeType: "major",
      createdBy: "coach@nevermine.test",
      reason: "Se retira una métrica obsoleta",
      changeSummary: `Se elimina ${removed.code}`,
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const result = compareConfigurationVersions(
      pack.id,
      current!.semanticVersion,
      created.version.semanticVersion,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const { comparison } = result;
    expect(comparison.summary.verdict).toBe("breaking");
    expect(
      comparison.knowledgeChanges.some((c) => c.kind === "REMOVED" && c.id === removed.code),
    ).toBe(true);
    expect(comparison.humanSummary).toContain("Versión");
    // Comparar es sólo leer: el historial no cambia por consultarlo.
    expect(configurationVersions.getVersion(created.version.versionId)?.checksum).toBe(
      created.version.checksum,
    );
  });

  it("informa del error cuando la versión candidata no existe", () => {
    const result = compareAgainstCurrent(pack.id, "99.0.0");
    expect(result.ok).toBe(false);
  });
});
