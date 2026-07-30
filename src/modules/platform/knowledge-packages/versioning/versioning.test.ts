import { describe, expect, it } from "vitest";
import { VersioningService } from "./service";
import { VersionGraph } from "./graph";
import { InMemoryVersionStore } from "./types";

/**
 * FEATURE-003.6 — El versionado es la memoria del sistema: si una versión
 * pudiera cambiar o perder su padre, el histórico dejaría de ser prueba de
 * nada. Estos tests protegen exactamente eso.
 */

interface Config {
  metrics: string[];
}

const base = {
  packageId: "pack.demo",
  createdBy: "coach@nevermine.test",
  reason: "Evolución del catálogo",
  changeSummary: "Se ajusta el contenido",
};

function service() {
  return new VersioningService<Config>();
}

function seedInitial(svc: VersioningService<Config>) {
  const created = svc.createVersion({
    ...base,
    changeType: "initial",
    snapshot: { metrics: ["goles"] },
  });
  if (!created.ok) throw new Error(created.errors.join(" "));
  return created.version;
}

describe("FEATURE-003.6 — Versioning Service", () => {
  it("la primera versión es 1.0.0 y no tiene padre", () => {
    const svc = service();
    const v1 = seedInitial(svc);
    expect(v1.semanticVersion).toBe("1.0.0");
    expect(v1.parentVersionId).toBeNull();
    expect(v1.changeType).toBe("initial");
  });

  it("aplica los saltos semánticos por tipo de cambio", () => {
    const svc = service();
    seedInitial(svc);
    const minor = svc.createMinor({ ...base, snapshot: { metrics: ["goles", "paradas"] } });
    const patch = svc.createPatch({ ...base, snapshot: { metrics: ["goles", "paradas"] } });
    const major = svc.createMajor({ ...base, snapshot: { metrics: ["paradas"] } });
    expect(minor.ok && minor.version.semanticVersion).toBe("1.1.0");
    expect(patch.ok && patch.version.semanticVersion).toBe("1.1.1");
    expect(major.ok && major.version.semanticVersion).toBe("2.0.0");
  });

  it("no admite una versión sin padre salvo la inicial", () => {
    const svc = service();
    const orphan = svc.createVersion({ ...base, changeType: "minor", snapshot: { metrics: [] } });
    expect(orphan.ok).toBe(false);
    if (!orphan.ok) expect(orphan.errors.join(" ")).toContain("debe ser \"initial\"");
  });

  it("no admite dos versiones iniciales en la misma configuración", () => {
    const svc = service();
    seedInitial(svc);
    const second = svc.createVersion({ ...base, changeType: "initial", snapshot: { metrics: [] } });
    expect(second.ok).toBe(false);
  });

  it("rechaza versiones que no avanzan o ya existen", () => {
    const svc = service();
    seedInitial(svc);
    const back = svc.createVersion({
      ...base,
      changeType: "minor",
      semanticVersion: "0.9.0",
      snapshot: { metrics: [] },
    });
    expect(back.ok).toBe(false);
    const same = svc.createVersion({
      ...base,
      changeType: "patch",
      semanticVersion: "1.0.0",
      snapshot: { metrics: [] },
    });
    expect(same.ok).toBe(false);
  });

  it("rechaza prerelease y metadatos de build", () => {
    const svc = service();
    const bad = svc.createVersion({
      ...base,
      changeType: "initial",
      semanticVersion: "1.0.0-beta.1",
      snapshot: { metrics: [] },
    });
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.errors.join(" ")).toContain("mayor.menor.parche");
  });

  it("exige autor, motivo y resumen", () => {
    const svc = service();
    const bad = svc.createVersion({
      packageId: "pack.demo",
      createdBy: "  ",
      reason: "",
      changeSummary: "",
      changeType: "initial",
      snapshot: { metrics: [] },
    });
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.errors).toHaveLength(3);
  });

  it("guarda metadatos opcionales de ADR e issue", () => {
    const svc = service();
    const created = svc.createVersion({
      ...base,
      changeType: "initial",
      snapshot: { metrics: [] },
      adr: "ADR-001",
      issue: "FEATURE-003.6",
    });
    expect(created.ok && created.version.adr).toBe("ADR-001");
    expect(created.ok && created.version.issue).toBe("FEATURE-003.6");
  });

  it("cada versión es un snapshot completo reconstruible por sí solo", () => {
    const svc = service();
    seedInitial(svc);
    const v2 = svc.createMinor({ ...base, snapshot: { metrics: ["goles", "asistencias"] } });
    expect(v2.ok).toBe(true);
    if (!v2.ok) return;
    expect(svc.reconstruct(v2.version.versionId)).toEqual({ metrics: ["goles", "asistencias"] });
    expect(svc.verify(v2.version.versionId).ok).toBe(true);
  });

  it("una versión registrada es inmutable", () => {
    const svc = service();
    const v1 = seedInitial(svc);
    expect(() => {
      (v1 as { changeSummary: string }).changeSummary = "manipulado";
    }).toThrow();
    expect(svc.getVersion(v1.versionId)?.changeSummary).toBe(base.changeSummary);
  });

  it("el store nunca sobrescribe una versión existente", () => {
    const store = new InMemoryVersionStore<Config>();
    const svc = new VersioningService<Config>({ store, newVersionId: () => "fijo" });
    seedInitial(svc);
    expect(() => svc.createMinor({ ...base, snapshot: { metrics: [] } })).toThrow(/inmutable/);
  });

  it("el historial es cronológico y describe cada cambio", () => {
    const svc = service();
    seedInitial(svc);
    svc.createMinor({ ...base, changeSummary: "Nueva métrica", snapshot: { metrics: ["a"] } });
    svc.createMajor({ ...base, changeSummary: "Rompe compatibilidad", snapshot: { metrics: ["b"] } });
    const history = svc.getHistory("pack.demo");
    expect(history.map((h) => h.semanticVersion)).toEqual(["1.0.0", "1.1.0", "2.0.0"]);
    expect(history.map((h) => h.changeType)).toEqual(["initial", "minor", "major"]);
    expect(history.every((h) => h.createdBy && h.changeSummary)).toBe(true);
    expect(history[0]).not.toHaveProperty("snapshot");
  });

  it("el linaje conserva origen, actual y cadena completa", () => {
    const svc = service();
    seedInitial(svc);
    svc.createMinor({ ...base, snapshot: { metrics: ["a"] } });
    svc.createMinor({ ...base, snapshot: { metrics: ["a", "b"] } });
    svc.createMajor({ ...base, snapshot: { metrics: ["c"] } });
    const lineage = svc.getLineage("pack.demo");
    expect(lineage.origin?.semanticVersion).toBe("1.0.0");
    expect(lineage.current?.semanticVersion).toBe("2.0.0");
    expect(lineage.chain.map((v) => v.semanticVersion)).toEqual(["1.0.0", "1.1.0", "1.2.0", "2.0.0"]);
  });

  it("el grafo se recorre en ambos sentidos", () => {
    const svc = service();
    const v1 = seedInitial(svc);
    const v11 = svc.createMinor({ ...base, snapshot: { metrics: ["a"] } });
    const v2 = svc.createMajor({ ...base, snapshot: { metrics: ["b"] } });
    if (!v11.ok || !v2.ok) throw new Error("versiones no creadas");
    const graph = svc.graphOf("pack.demo");
    expect(graph.parentOf(v2.version.versionId)?.versionId).toBe(v11.version.versionId);
    expect(graph.childOfVersion(v1.versionId)?.versionId).toBe(v11.version.versionId);
    expect(graph.ancestryOf(v2.version.versionId).map((v) => v.semanticVersion)).toEqual([
      "1.0.0",
      "1.1.0",
      "2.0.0",
    ]);
    expect(graph.descendantsOf(v1.versionId).map((v) => v.semanticVersion)).toEqual(["1.1.0", "2.0.0"]);
    expect(svc.validateLineage("pack.demo").ok).toBe(true);
  });

  it("detecta linajes corruptos: sin raíz, con padre inexistente o bifurcados", () => {
    const record = (id: string, parent: string | null, version: string) => ({
      versionId: id,
      packageId: "p",
      semanticVersion: version,
      parentVersionId: parent,
      createdAt: "2026-01-01T00:00:00.000Z",
      createdBy: "a",
      changeType: parent ? ("minor" as const) : ("initial" as const),
      changeSummary: "s",
      reason: "r",
      adr: null,
      issue: null,
      checksum: "x",
      publicationState: "unpublished" as const,
      lifecycleState: "draft" as const,
      trustLevel: "official" as const,
      merge: null,
      snapshot: null,
    });
    expect(new VersionGraph([record("b", "missing", "1.1.0")]).validate().length).toBeGreaterThan(0);
    const forked = new VersionGraph([
      record("a", null, "1.0.0"),
      record("b", "a", "1.1.0"),
      record("c", "a", "1.2.0"),
    ]);
    expect(forked.validate().join(" ")).toContain("no se admiten ramas");
  });

  it("cada configuración tiene su propia historia independiente", () => {
    const svc = service();
    seedInitial(svc);
    svc.createVersion({
      ...base,
      packageId: "pack.otro",
      changeType: "initial",
      snapshot: { metrics: [] },
    });
    expect(svc.getHistory("pack.otro")).toHaveLength(1);
    expect(svc.listPackages()).toEqual(["pack.demo", "pack.otro"]);
  });
});
