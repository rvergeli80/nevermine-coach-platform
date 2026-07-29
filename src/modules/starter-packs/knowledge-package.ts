import { ENGINE_ID, ENGINE_VERSION } from "./install-plan";
import type { StarterPack } from "./types";
import {
  UNSIGNED,
  checksumOfDescriptor,
  type HostEnvironment,
  type KnowledgePackageDescriptor,
} from "../platform/knowledge-packages";

/**
 * FEATURE-003.2 — Adaptador Coach → Knowledge Package.
 *
 * El repositorio pertenece a la plataforma y desconoce qué es un Starter Pack.
 * Es Coach —dueño del `kind` "starter_pack"— quien traduce sus packs al
 * descriptor común y quien sabe instalar el `payload`. Añadir otro producto
 * (Health, Legal) es escribir otro adaptador, no tocar la plataforma.
 */

/** Producto que publica y consume estos paquetes. */
export const COACH_PRODUCT = "coach";
export const COACH_PRODUCT_VERSION = "1.0.0";

/** Entorno de ejecución actual: producto Coach sobre el Engine SportSpace. */
export const coachHostEnvironment: HostEnvironment = {
  product: COACH_PRODUCT,
  productVersion: COACH_PRODUCT_VERSION,
  engines: [{ engine: ENGINE_ID, version: ENGINE_VERSION }],
};

export type StarterPackDescriptor = KnowledgePackageDescriptor<StarterPack>;

/** Convierte un Starter Pack en descriptor de plataforma, con checksum calculado. */
export function toKnowledgePackage(pack: StarterPack): StarterPackDescriptor {
  const base: Omit<StarterPackDescriptor, "checksum"> = {
    id: pack.id,
    name: pack.name,
    summary: pack.summary,
    kind: "starter_pack",
    origin: pack.origin,
    status: pack.status === "published" ? "published" : "deprecated",
    trust: "unverified",
    version: pack.version,
    author: pack.author,
    publishedAt: pack.publishedAt,
    domain: pack.domain ?? "sport",
    category: pack.category ?? pack.sport.code,
    tags: pack.tags ?? [pack.sport.code, "starter-pack"],
    compatibility: {
      products: [
        {
          product: COACH_PRODUCT,
          minVersion: pack.compatibility.minProductVersion ?? "1.0.0",
          maxVersion: pack.compatibility.maxProductVersion ?? null,
        },
      ],
      engines: [
        {
          engine: pack.compatibility.engine,
          minVersion: pack.compatibility.minEngineVersion,
          maxVersion: pack.compatibility.maxEngineVersion ?? null,
        },
      ],
    },
    dependencies: (pack.dependencies ?? []).map((dep) => ({
      packageId: dep.packId,
      minVersion: dep.minVersion,
      maxVersion: dep.maxVersion ?? null,
      optional: dep.optional ?? false,
    })),
    signature: UNSIGNED,
    payload: pack,
  };

  return { ...base, checksum: checksumOfDescriptor(base) };
}
