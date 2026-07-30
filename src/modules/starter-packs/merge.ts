/**
 * FEATURE-003.8 — Fusión de configuraciones de Coach.
 *
 * Coach no fusiona por su cuenta: declara cómo se proyecta y cómo se
 * reconstruye un Starter Pack y delega todo lo demás en el `MergeService` de
 * la plataforma. Aquí no hay reglas de fusión, ni resolución de conflictos, ni
 * decisiones: sólo traducción de formato.
 */

import {
  createMergeService,
  type KnowledgeEntity,
  type MergeAdapter,
  type MergeConflict,
  type MergeResult,
  type MergeService,
} from "../platform/knowledge-packages";
import { configurationComparison, starterPackProjector } from "./comparison";
import { configurationVersions } from "./versioning";
import type { PackDependency, PackGroup, PackMetric, PackProfile, StarterPack } from "./types";

/** Reconstruye un objeto anidado a partir de rutas lógicas aplanadas. */
function unflatten(flat: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const path of Object.keys(flat).sort()) {
    const parts = path.split(".");
    let cursor = out;
    for (const part of parts.slice(0, -1)) {
      if (typeof cursor[part] !== "object" || cursor[part] === null || Array.isArray(cursor[part])) {
        cursor[part] = {};
      }
      cursor = cursor[part] as Record<string, unknown>;
    }
    cursor[parts[parts.length - 1]] = flat[path];
  }
  return out;
}

function optional(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function toGroup(entity: KnowledgeEntity): PackGroup {
  const f = entity.fields as Record<string, unknown>;
  return {
    code: entity.id,
    name: String(f.name ?? entity.label ?? entity.id),
    color: optional(f.color),
    icon: optional(f.icon),
  };
}

function toMetric(entity: KnowledgeEntity): PackMetric {
  const f = entity.fields as Record<string, unknown>;
  return {
    code: entity.id,
    name: String(f.name ?? entity.id),
    group: String(f.group ?? ""),
    nature: f.nature as PackMetric["nature"],
    valueType: f.valueType as PackMetric["valueType"],
    direction: f.direction as PackMetric["direction"],
    scope: f.scope as PackMetric["scope"],
    unit: optional(f.unit),
    shortDescription: optional(f.shortDescription),
    formula: optional(f.formula),
    nullPolicy: (optional(f.nullPolicy) as PackMetric["nullPolicy"]) ?? undefined,
  };
}

function toProfile(entity: KnowledgeEntity): PackProfile {
  const f = entity.fields as Record<string, unknown>;
  return {
    code: entity.id,
    name: String(f.name ?? entity.id),
    description: optional(f.description),
    weights: ((f.weights ?? []) as PackProfile["weights"]).map((w) => ({
      metric: w.metric,
      weight: w.weight,
      sign: w.sign,
    })),
  };
}

function toDependency(entity: KnowledgeEntity): PackDependency {
  const f = entity.fields as Record<string, unknown>;
  return {
    packId: entity.id,
    minVersion: String(f.minVersion ?? "1.0.0"),
    maxVersion: (f.maxVersion as string | null) ?? null,
    optional: Boolean(f.optional),
  };
}

/**
 * Adaptador de fusión de Coach: misma proyección que la comparación, más la
 * reconstrucción del pack. Determinista: el orden de salida sólo depende de
 * los códigos, nunca del orden de entrada.
 */
export const starterPackMergeAdapter: MergeAdapter<StarterPack> = {
  ...starterPackProjector,

  materialize(base, merged) {
    const config = unflatten(merged.configuration) as Partial<StarterPack> & {
      sport?: StarterPack["sport"];
      catalog?: StarterPack["catalog"];
      compatibility?: StarterPack["compatibility"];
    };

    const byKind = (kind: string) =>
      merged.knowledge
        .filter((entity) => entity.kind === kind)
        .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

    return {
      ...base,
      name: config.name ?? base.name,
      summary: config.summary ?? base.summary,
      author: config.author ?? base.author,
      status: config.status ?? base.status,
      origin: config.origin ?? base.origin,
      domain: config.domain ?? base.domain,
      category: config.category ?? base.category,
      tags: config.tags ?? base.tags,
      sport: { ...base.sport, ...(config.sport ?? {}) },
      catalog: { ...base.catalog, ...(config.catalog ?? {}) },
      compatibility: { ...base.compatibility, ...(config.compatibility ?? {}) },
      groups: byKind("group").map(toGroup),
      metrics: byKind("metric").map(toMetric),
      profiles: byKind("profile").map(toProfile),
      dependencies: byKind("dependency").map(toDependency),
    };
  },
};

/** Servicio de fusión de las configuraciones de Coach. */
export const configurationMerge: MergeService<StarterPack> = createMergeService<StarterPack>({
  adapter: starterPackMergeAdapter,
  versions: configurationVersions,
  comparison: configurationComparison,
});

function resolveVersionIds(
  packId: string,
  from: string,
  to: string,
): { ok: true; sourceVersionId: string; targetVersionId: string } | { ok: false; errors: string[] } {
  const errors: string[] = [];
  const source = configurationVersions.getVersion(packId, from);
  const target = configurationVersions.getVersion(packId, to);
  if (!source) errors.push(`La versión "${packId}@${from}" no existe.`);
  if (!target) errors.push(`La versión "${packId}@${to}" no existe.`);
  if (!source || !target) return { ok: false, errors };
  return { ok: true, sourceVersionId: source.versionId, targetVersionId: target.versionId };
}

export type ConfigurationMergeOutcome =
  | { ok: true; result: MergeResult<StarterPack> }
  | { ok: false; errors: string[]; result?: MergeResult<StarterPack> };

/** Vista previa de la fusión: no crea versión ni persiste nada. */
export function previewConfigurationMerge(
  packId: string,
  from: string,
  to: string,
): ConfigurationMergeOutcome {
  const ids = resolveVersionIds(packId, from, to);
  if (!ids.ok) return ids;
  return configurationMerge.previewMerge({
    sourceVersionId: ids.sourceVersionId,
    targetVersionId: ids.targetVersionId,
  });
}

/** Ejecuta la fusión; el éxito crea una versión nueva vía VersioningService. */
export function mergeConfigurationVersions(input: {
  packId: string;
  from: string;
  to: string;
  mergeAuthor: string;
  reason: string;
  changeSummary: string;
  changeType?: "major" | "minor" | "patch";
}): ConfigurationMergeOutcome {
  const ids = resolveVersionIds(input.packId, input.from, input.to);
  if (!ids.ok) return ids;
  return configurationMerge.merge({
    sourceVersionId: ids.sourceVersionId,
    targetVersionId: ids.targetVersionId,
    mergeAuthor: input.mergeAuthor,
    reason: input.reason,
    changeSummary: input.changeSummary,
    changeType: input.changeType,
  });
}

/** Explicación legible de los conflictos de una fusión. */
export function explainConfigurationMergeConflicts(conflicts: readonly MergeConflict[]): string {
  return configurationMerge.explainConflicts(conflicts);
}
