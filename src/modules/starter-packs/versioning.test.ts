import { describe, expect, it } from "vitest";
import {
  configurationHistory,
  configurationLineage,
  configurationSnapshot,
  recordConfigurationChange,
} from "./versioning";
import { starterPacks } from "./repository";

/**
 * FEATURE-003.6 — Coach no versiona por su cuenta: cada configuración vive
 * dentro del motor de versionado de la plataforma.
 */
describe("FEATURE-003.6 — Versionado de configuraciones en Coach", () => {
  const pack = starterPacks[0];

  it("el catálogo oficial arranca con su linaje ya registrado", () => {
    const history = configurationHistory(pack.id);
    expect(history.length).toBeGreaterThan(0);
    expect(history[0].changeType).toBe("initial");
    expect(history.every((v) => v.createdBy && v.reason && v.changeSummary)).toBe(true);
  });

  it("el linaje apunta al origen y a la versión vigente", () => {
    const lineage = configurationLineage(pack.id);
    expect(lineage.origin?.semanticVersion).toBe(lineage.chain[0].semanticVersion);
    expect(lineage.current?.semanticVersion).toBe(pack.version);
  });

  it("cada versión conserva el snapshot completo de la configuración", () => {
    const snapshot = configurationSnapshot(pack.id, pack.version);
    expect(snapshot?.metrics.length).toBe(pack.metrics.length);
  });

  it("modificar una configuración crea una versión nueva, nunca reescribe", () => {
    const before = configurationHistory(pack.id).length;
    const result = recordConfigurationChange({
      pack: { ...pack, name: `${pack.name} (revisado)` },
      changeType: "patch",
      createdBy: "coach@nevermine.test",
      reason: "Corrección del nombre visible",
      changeSummary: "Se renombra el pack",
    });
    expect(result.ok).toBe(true);
    const after = configurationHistory(pack.id);
    expect(after.length).toBe(before + 1);
    expect(configurationSnapshot(pack.id, pack.version)?.name).toBe(pack.name);
  });
});
