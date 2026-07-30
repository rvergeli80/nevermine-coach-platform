import { describe, expect, it } from "vitest";
import {
  ComparisonService,
  InMemoryVersionStore,
  VersioningService,
  compareKnowledgeEntities,
  createComparisonService,
  diffFields,
  flatten,
  type ComparisonProjector,
  type KnowledgeEntity,
} from "./index";

/** Snapshot mínimo de prueba: parámetros + entidades con identidad lógica. */
interface Snapshot {
  params: Record<string, unknown>;
  entities: KnowledgeEntity[];
}

const projector: ComparisonProjector<Snapshot> = {
  configuration: (s) => s.params,
  knowledge: (s) => s.entities,
};

function serviceWith(now = () => "2026-01-01T00:00:00.000Z") {
  const versions = new VersioningService<Snapshot>({ store: new InMemoryVersionStore<Snapshot>() });
  const comparison = createComparisonService<Snapshot>({ projector, versions, now });
  return { versions, comparison };
}

function seed(versions: VersioningService<Snapshot>, snapshot: Snapshot, changeType: "initial" | "minor" | "major") {
  const created = versions.createVersion({
    packageId: "pkg",
    snapshot,
    createdBy: "tester",
    reason: "test",
    changeSummary: "test",
    changeType,
    lifecycleState: "published",
    publicationState: "published",
    trustLevel: "official",
  });
  if (!created.ok) throw new Error(created.errors.join(" "));
  return created.version;
}

describe("FEATURE-003.7 — Comparación estructural", () => {
  it("el orden de claves y de listas simples no produce diferencias", () => {
    const a = flatten({ b: 1, a: { y: [2, 1] } });
    const b = flatten({ a: { y: [1, 2] }, b: 1 });
    expect(diffFields(a, b)).toEqual([]);
  });

  it("clasifica añadidos, eliminados y modificados", () => {
    const changes = diffFields({ a: 1, b: 2 }, { b: 3, c: 4 });
    expect(changes.map((c) => [c.path, c.kind])).toEqual([
      ["a", "REMOVED"],
      ["b", "MODIFIED"],
      ["c", "ADDED"],
    ]);
  });

  it("el conocimiento se compara por identidad lógica, no por texto", () => {
    const before: KnowledgeEntity[] = [{ kind: "capability", id: "cap.a", label: "Antigua", fields: { v: 1 } }];
    const after: KnowledgeEntity[] = [{ kind: "capability", id: "cap.a", label: "Renombrada", fields: { v: 1 } }];
    expect(compareKnowledgeEntities(before, after)).toEqual([]);
  });
});

describe("FEATURE-003.7 — ComparisonService", () => {
  it("dos versiones idénticas se declaran idénticas y compatibles", () => {
    const { versions, comparison } = serviceWith();
    const snapshot: Snapshot = { params: { a: 1 }, entities: [] };
    const v1 = seed(versions, snapshot, "initial");
    const v2 = seed(versions, { params: { a: 1 }, entities: [] }, "minor");
    const result = comparison.compareVersions(v1, v2);
    expect(result.summary.identical).toBe(true);
    expect(result.summary.verdict).toBe("compatible");
    expect(result.humanSummary).toContain("Sin diferencias");
  });

  it("es determinista: la misma comparación produce exactamente el mismo resultado", () => {
    const { versions, comparison } = serviceWith();
    const v1 = seed(versions, { params: { a: 1 }, entities: [] }, "initial");
    const v2 = seed(versions, { params: { a: 2, b: 3 }, entities: [] }, "minor");
    expect(comparison.compareVersions(v1, v2)).toEqual(comparison.compareVersions(v1, v2));
    expect(comparison.compareVersions(v1, v2).comparisonId).toBe(
      comparison.compareVersions(v1, v2).comparisonId,
    );
  });

  it("eliminar una capability es un cambio incompatible explicado", () => {
    const { versions, comparison } = serviceWith();
    const cap: KnowledgeEntity = { kind: "capability", id: "cap.a", fields: {} };
    const v1 = seed(versions, { params: {}, entities: [cap] }, "initial");
    const v2 = seed(versions, { params: {}, entities: [] }, "minor");
    const result = comparison.compareVersions(v1, v2);
    expect(result.summary.verdict).toBe("breaking");
    expect(result.summary.compatible).toBe(false);
    expect(result.reasons.some((r) => r.code === "capability_removed")).toBe(true);
  });

  it("una bajada de trust rompe y una subida sólo advierte", () => {
    const store = new InMemoryVersionStore<Snapshot>();
    const versions = new VersioningService<Snapshot>({ store });
    const comparison = new ComparisonService<Snapshot>({ projector, versions });
    const base = { packageId: "pkg", snapshot: { params: {}, entities: [] }, createdBy: "t", reason: "r", changeSummary: "s" };
    const v1 = versions.createVersion({ ...base, changeType: "initial", trustLevel: "official" });
    const v2 = versions.createVersion({ ...base, changeType: "minor", trustLevel: "community" });
    if (!v1.ok || !v2.ok) throw new Error("seed");
    const down = comparison.compareVersions(v1.version, v2.version);
    expect(down.summary.verdict).toBe("breaking");
    expect(down.reasons.some((r) => r.code === "trust_downgraded")).toBe(true);
    const up = comparison.compareVersions(v2.version, v1.version);
    expect(up.reasons.some((r) => r.code === "trust_changed")).toBe(true);
  });

  it("un salto mayor se considera incompatible por declaración del autor", () => {
    const { versions, comparison } = serviceWith();
    const v1 = seed(versions, { params: { a: 1 }, entities: [] }, "initial");
    const v2 = seed(versions, { params: { a: 1, b: 2 }, entities: [] }, "major");
    const result = comparison.compareVersions(v1, v2);
    expect(result.targetVersion.semanticVersion).toBe("2.0.0");
    expect(result.reasons.some((r) => r.code === "major_version_bump")).toBe(true);
  });

  it("comparar por identificador inexistente informa del error sin lanzar", () => {
    const { comparison } = serviceWith();
    const result = comparison.comparePackageVersions("pkg", "1.0.0", "9.9.9");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.length).toBeGreaterThan(0);
  });

  it("el resumen legible enumera parámetros y conocimiento", () => {
    const { versions, comparison } = serviceWith();
    const v1 = seed(versions, { params: { a: 1 }, entities: [] }, "initial");
    const v2 = seed(
      versions,
      { params: { a: 1, b: 2, c: 3, d: 4 }, entities: [{ kind: "capability", id: "cap.x", fields: {} }] },
      "minor",
    );
    const summary = comparison.compareVersions(v1, v2).humanSummary;
    expect(summary).toContain("Versión 1.0.0 → 1.1.0");
    expect(summary).toContain("3 parámetros añadidos");
    expect(summary).toContain("1 capability nuevas");
    expect(summary).toContain("Trust Level sin cambios");
  });

  it("comparar no altera ninguna versión", () => {
    const { versions, comparison } = serviceWith();
    const v1 = seed(versions, { params: { a: 1 }, entities: [] }, "initial");
    const v2 = seed(versions, { params: { a: 2 }, entities: [] }, "minor");
    const before = JSON.stringify([v1, v2]);
    comparison.compareVersions(v1, v2);
    expect(JSON.stringify([versions.getVersion(v1.versionId), versions.getVersion(v2.versionId)])).toBe(before);
  });
});
