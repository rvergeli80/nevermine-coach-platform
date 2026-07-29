import type { StarterPack } from "./types";
import { waterpoloPack } from "./waterpolo";

export * from "./types";
export * from "./rules";
export * from "./version";
export * from "./install-plan";
export * from "./installation";

/**
 * Catálogo oficial de Starter Packs (FEATURE-003.1).
 * Añadir un deporte = añadir datos, no código. Los packs de comunidad,
 * enterprise o privados se incorporarán como otras fuentes del mismo catálogo
 * sin cambiar este modelo.
 */
export const starterPacks: readonly StarterPack[] = [waterpoloPack];

export function findStarterPack(id: string): StarterPack | undefined {
  return starterPacks.find((pack) => pack.id === id);
}

/** Última versión publicada de un pack del catálogo oficial. */
export function latestVersionOf(id: string): string | null {
  return findStarterPack(id)?.version ?? null;
}
