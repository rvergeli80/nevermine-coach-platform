/**
 * FEATURE-003.2 — Resolución de dependencias entre Knowledge Packages.
 *
 * Un paquete puede depender de otros. La instalación resuelve el grafo y
 * devuelve un orden topológico (dependencias primero). No se resuelven
 * conflictos de versión todavía: si el repositorio no ofrece una versión que
 * satisfaga el rango, la resolución falla en lugar de elegir por su cuenta.
 */

import { satisfiesRange } from "../semver";
import type { KnowledgePackageDescriptor } from "./types";

export type ResolveDependenciesResult =
  | { ok: true; order: KnowledgePackageDescriptor[]; skipped: string[] }
  | { ok: false; errors: string[] };

export interface DependencyLookup {
  /** Devuelve la versión disponible del paquete, o `undefined` si no existe. */
  (packageId: string): KnowledgePackageDescriptor | undefined;
}

/**
 * Orden de instalación de `root` y sus dependencias (DFS post-orden).
 * Detecta ciclos, ausencias y rangos de versión no satisfechos.
 */
export function resolveDependencies(
  root: KnowledgePackageDescriptor,
  lookup: DependencyLookup,
): ResolveDependenciesResult {
  const errors: string[] = [];
  const skipped: string[] = [];
  const order: KnowledgePackageDescriptor[] = [];
  const done = new Set<string>();
  const stack: string[] = [];

  const visit = (pkg: KnowledgePackageDescriptor) => {
    if (done.has(pkg.id)) return;
    if (stack.includes(pkg.id)) {
      errors.push(`Dependencia circular: ${[...stack, pkg.id].join(" → ")}.`);
      return;
    }
    stack.push(pkg.id);

    for (const dep of pkg.dependencies ?? []) {
      const found = lookup(dep.packageId);
      if (!found) {
        if (dep.optional) skipped.push(dep.packageId);
        else errors.push(`El paquete "${pkg.id}" depende de "${dep.packageId}", que no está en el repositorio.`);
        continue;
      }
      if (!satisfiesRange(found.version, dep)) {
        errors.push(
          `El paquete "${pkg.id}" requiere "${dep.packageId}" ${dep.minVersion}` +
            `${dep.maxVersion ? `–${dep.maxVersion}` : " o superior"}` +
            ` y el repositorio ofrece ${found.version}.`,
        );
        continue;
      }
      visit(found);
    }

    stack.pop();
    done.add(pkg.id);
    order.push(pkg);
  };

  visit(root);

  return errors.length > 0 ? { ok: false, errors } : { ok: true, order, skipped };
}

/** Paquetes del repositorio que dependen de `packageId` (impacto de una retirada). */
export function dependentsOf(
  packageId: string,
  all: readonly KnowledgePackageDescriptor[],
): KnowledgePackageDescriptor[] {
  return all.filter((pkg) => (pkg.dependencies ?? []).some((d) => d.packageId === packageId));
}
