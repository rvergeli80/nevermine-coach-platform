/**
 * FEATURE-003.7 — Comparación de configuraciones de Coach.
 *
 * Coach no compara por su cuenta: proyecta sus Starter Packs hacia el modelo
 * de comparación de la plataforma y delega en el `ComparisonService`. Aquí
 * sólo vive la traducción "qué es configuración y qué es conocimiento" en un
 * pack de Coach.
 */

import {
  createComparisonService,
  type ComparisonProjector,
  type ComparisonResult,
  type ComparisonService,
  type KnowledgeEntity,
} from "../platform/knowledge-packages";
import { configurationVersions } from "./versioning";
import type { StarterPack } from "./types";

/**
 * Configuración = parámetros del pack. El conocimiento (grupos, métricas,
 * perfiles, dependencias) se compara aparte, por identidad lógica.
 */
export const starterPackProjector: ComparisonProjector<StarterPack> = {
  configuration(pack) {
    return {
      name: pack.name,
      summary: pack.summary,
      author: pack.author,
      status: pack.status,
      origin: pack.origin,
      domain: pack.domain ?? null,
      category: pack.category ?? null,
      tags: pack.tags ?? [],
      sport: pack.sport,
      catalog: pack.catalog,
      compatibility: pack.compatibility,
    };
  },

  knowledge(pack) {
    const entities: KnowledgeEntity[] = [];

    for (const group of pack.groups) {
      entities.push({
        kind: "group",
        id: group.code,
        label: group.name,
        fields: { name: group.name, color: group.color ?? null, icon: group.icon ?? null },
      });
    }

    for (const metric of pack.metrics) {
      entities.push({
        kind: "metric",
        id: metric.code,
        label: metric.name,
        fields: {
          name: metric.name,
          group: metric.group,
          nature: metric.nature,
          valueType: metric.valueType,
          direction: metric.direction,
          scope: metric.scope,
          unit: metric.unit ?? null,
          formula: metric.formula ?? null,
          nullPolicy: metric.nullPolicy ?? null,
          shortDescription: metric.shortDescription ?? null,
        },
      });
    }

    for (const profile of pack.profiles) {
      entities.push({
        kind: "profile",
        id: profile.code,
        label: profile.name,
        fields: {
          name: profile.name,
          description: profile.description ?? null,
          // Los pesos se ordenan por métrica: reordenarlos no es un cambio.
          weights: [...profile.weights]
            .sort((a, b) => (a.metric < b.metric ? -1 : a.metric > b.metric ? 1 : 0))
            .map((w) => ({ metric: w.metric, weight: w.weight, sign: w.sign })),
        },
      });
    }

    for (const dependency of pack.dependencies ?? []) {
      entities.push({
        kind: "dependency",
        id: dependency.packId,
        label: dependency.packId,
        fields: {
          minVersion: dependency.minVersion,
          maxVersion: dependency.maxVersion ?? null,
          optional: dependency.optional ?? false,
        },
      });
    }

    return entities;
  },

  metadata(pack) {
    return {
      publisherName: pack.author,
      owner: pack.origin,
      certification: pack.status === "published" ? "certified" : "uncertified",
    };
  },
};

/** Servicio de comparación de las configuraciones de Coach. */
export const configurationComparison: ComparisonService<StarterPack> =
  createComparisonService<StarterPack>({
    projector: starterPackProjector,
    versions: configurationVersions,
  });

/**
 * Compara dos versiones de una configuración. Devuelve el informe completo;
 * nunca decide ni aplica nada: la decisión es del entrenador.
 */
export function compareConfigurationVersions(
  packId: string,
  from: string,
  to: string,
): { ok: true; comparison: ComparisonResult } | { ok: false; errors: string[] } {
  return configurationComparison.comparePackageVersions(packId, from, to);
}

/** Comparación previa a una actualización: versión vigente frente a la candidata. */
export function compareAgainstCurrent(
  packId: string,
  candidate: string,
): { ok: true; comparison: ComparisonResult } | { ok: false; errors: string[] } {
  const current = configurationVersions.getCurrent(packId);
  if (!current) return { ok: false, errors: [`La configuración "${packId}" no tiene versiones registradas.`] };
  return configurationComparison.comparePackageVersions(packId, current.semanticVersion, candidate);
}
