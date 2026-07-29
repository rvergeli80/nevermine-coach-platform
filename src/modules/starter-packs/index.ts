import type { StarterPack } from "./types";
import { waterpoloPack } from "./waterpolo";

export * from "./types";
export * from "./rules";

/** Registro de packs disponibles. Añadir un deporte = añadir datos, no código. */
export const starterPacks: readonly StarterPack[] = [waterpoloPack];

export function findStarterPack(id: string): StarterPack | undefined {
  return starterPacks.find((pack) => pack.id === id);
}
