/**
 * FEATURE-003.8 — Tests del Merge Engine de la plataforma.
 */

import { describe, expect, it } from "vitest";
import { createComparisonService } from "../comparison";
import { createVersioningService, type VersioningService } from "../versioning";
import { createMergeService, type MergeAdapter } from "./index";

interface Snap {
  params: Record<string, unknown>;
  items: { code: string; name: string; value: number }[];
}

const adapter: MergeAdapter<Snap> = {
  configuration: (snap) => ({ ...snap.params }),
  knowledge: (snap) =>
    snap.items.map((item) => ({
      kind: "item",
      id: item.code,
      label: item.name,
      fields: { name: item.name, value: item.value },
    })),
  materialize: (base, merged) => ({
    ...base,
    params: merged.configuration as Record<string, unknown>,
    items: merged.knowledge.map((entity) => ({
      code: entity.id,
      name: String(entity.fields.name),
      value: Number(entity.fields.value),
    })),
  }),
};

function scenario(source: Snap, target: Snap, options: { trustDrop?: boolean } = {}) {
  const versions: VersioningService<Snap> = createVersioningService<Snap>({
    now: () => "2026-01-01T00:00:00.000Z",
    newVersionId: (pkg, ver) => `${pkg}@${ver}`,
  });
  const first = versions.createVersion({
    packageId: "p",
    snapshot: target,
    createdBy: "coach",
    changeType: "initial",
    reason: "r",
    changeSummary: "s",
    trustLevel: "official",
  });
  expect(first.ok).toBe(true);
  const second = versions.createVersion({
    packageId: "p",
    snapshot: source,
    createdBy: "coach",
    changeType: "minor",
    reason: "r",
    changeSummary: "s",
    trustLevel: options.trustDrop ? "community" : "official",
  });
  expect(second.ok).toBe(true);

  const merge = createMergeService<Snap>({
    adapter,
    versions,
    comparison: createComparisonService<Snap>({ projector: adapter, versions }),
    now: () => "2026-02-01T00:00:00.000Z",
  });
  return { versions, merge, sourceVersionId: "p@1.1.0", targetVersionId: "p@1.0.0" };
}

const base: Snap = { params: { a: 1 }, items: [{ code: "x", name: "X", value: 1 }] };

describe("MergeService", () => {
  it("valida que ambas versiones existan y sean de la misma configuración", () => {
    const { merge } = scenario(base, base);
    expect(merge.validateMerge({ sourceVersionId: "p@9.9.9", targetVersionId: "p@1.0.0" }).ok).toBe(false);
    expect(merge.validateMerge({ sourceVersionId: "p@1.0.0", targetVersionId: "p@1.0.0" }).ok).toBe(false);
  });

  it("fusiona automáticamente parámetros y conocimiento nuevos", () => {
    const source: Snap = {
      params: { a: 1, b: 2 },
      items: [
        { code: "x", name: "X", value: 1 },
        { code: "y", name: "Y", value: 5 },
      ],
    };
    const { merge, sourceVersionId, targetVersionId } = scenario(source, base);
    const outcome = merge.previewMerge({ sourceVersionId, targetVersionId });
    expect(outcome.ok).toBe(true);
    const result = outcome.ok ? outcome.result : null;
    expect(result?.status).toBe("automatic");
    expect(result?.mergedVersion).toBeNull();
    expect(result?.mergedSnapshot.params).toEqual({ a: 1, b: 2 });
    expect(result?.mergedSnapshot.items.map((i) => i.code)).toEqual(["x", "y"]);
    expect(result?.conflicts).toHaveLength(0);
  });

  it("detecta conflicto BLOCKING cuando el mismo parámetro difiere", () => {
    const source: Snap = { params: { a: 99 }, items: base.items };
    const { merge, sourceVersionId, targetVersionId } = scenario(source, base);
    const outcome = merge.previewMerge({ sourceVersionId, targetVersionId });
    const result = outcome.ok ? outcome.result : null;
    expect(result?.status).toBe("requires_manual_resolution");
    expect(result?.conflicts[0].code).toBe("configuration_conflict");
    expect(result?.skippedChanges[0].kept).toBe(1);
    // El destino manda: nada se sobrescribe.
    expect(result?.mergedSnapshot.params).toEqual({ a: 1 });
  });

  it("rechaza la fusión ante una bajada de Trust", () => {
    const source: Snap = { params: { a: 1, b: 2 }, items: base.items };
    const { merge, sourceVersionId, targetVersionId } = scenario(source, base, { trustDrop: true });
    const preview = merge.previewMerge({ sourceVersionId, targetVersionId });
    const result = preview.ok ? preview.result : null;
    expect(result?.status).toBe("rejected");
    const executed = merge.merge({
      sourceVersionId,
      targetVersionId,
      mergeAuthor: "coach",
      reason: "r",
      changeSummary: "s",
    });
    expect(executed.ok).toBe(false);
  });

  it("una fusión exitosa crea una versión nueva con su procedencia", () => {
    const source: Snap = { params: { a: 1, b: 2 }, items: base.items };
    const { merge, versions, sourceVersionId, targetVersionId } = scenario(source, base);
    const executed = merge.merge({
      sourceVersionId,
      targetVersionId,
      mergeAuthor: "coach",
      reason: "Incorporar parámetro nuevo",
      changeSummary: "Se añade b",
    });
    expect(executed.ok).toBe(true);
    const created = executed.ok ? executed.result.mergedVersion : null;
    expect(created?.semanticVersion).toBe("1.2.0");
    expect(created?.merge?.mergedFrom).toEqual([sourceVersionId, targetVersionId]);
    expect(created?.merge?.mergeAuthor).toBe("coach");
    expect(created?.merge?.mergeTimestamp).toBe("2026-02-01T00:00:00.000Z");
    // Las versiones originales siguen intactas.
    expect(versions.getVersion(targetVersionId)?.snapshot.params).toEqual({ a: 1 });
    const lineage = versions.graphOf("p").mergeLineageOf(created!.versionId);
    expect(lineage?.source?.versionId).toBe(sourceVersionId);
    expect(lineage?.target?.versionId).toBe(targetVersionId);
  });

  it("es determinista: mismo mergeId, mismo checksum y mismo informe", () => {
    const source: Snap = {
      params: { b: 2, a: 1 },
      items: [
        { code: "y", name: "Y", value: 5 },
        { code: "x", name: "X", value: 1 },
      ],
    };
    const a = scenario(source, base);
    const b = scenario(source, base);
    const first = a.merge.previewMerge({ sourceVersionId: a.sourceVersionId, targetVersionId: a.targetVersionId });
    const second = b.merge.previewMerge({ sourceVersionId: b.sourceVersionId, targetVersionId: b.targetVersionId });
    expect(first.ok && second.ok).toBe(true);
    if (!first.ok || !second.ok) return;
    expect(first.result.mergeId).toBe(second.result.mergeId);
    expect(first.result.mergedChecksum).toBe(second.result.mergedChecksum);
    expect(first.result.humanSummary).toBe(second.result.humanSummary);
  });

  it("explica los conflictos en lenguaje humano", () => {
    const source: Snap = { params: { a: 99 }, items: base.items };
    const { merge, sourceVersionId, targetVersionId } = scenario(source, base);
    const explained = merge.explainConflicts({ sourceVersionId, targetVersionId });
    expect(explained.ok).toBe(true);
    if (explained.ok) expect(explained.explanation).toContain("BLOCKING");
  });

  it("no fusiona cuando no hay nada nuevo que aportar", () => {
    const { merge, sourceVersionId, targetVersionId } = scenario(base, base);
    const executed = merge.merge({
      sourceVersionId,
      targetVersionId,
      mergeAuthor: "coach",
      reason: "r",
      changeSummary: "s",
    });
    expect(executed.ok).toBe(false);
  });
});
