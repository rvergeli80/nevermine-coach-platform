import { checkFormula, type CatalogMetricRef, type ExistingFormula } from "../config/formula-rules";
import { codeSchema, nameSchema } from "../config/schemas";
import type { StarterPack } from "./types";
import { isValidVersion } from "./version";


/**
 * Validación pura de un Starter Pack antes de instanciarlo.
 * Se aplica igual en tests y en el servidor: un pack inválido nunca llega a la BD.
 */
export function checkStarterPack(pack: StarterPack): string[] {
  const errors: string[] = [];

  const codes = [
    pack.sport.code,
    pack.catalog.code,
    ...pack.groups.map((g) => g.code),
    ...pack.metrics.map((m) => m.code),
    ...pack.profiles.map((p) => p.code),
  ];
  for (const code of codes) {
    if (!codeSchema.safeParse(code).success) errors.push(`Código no válido: "${code}".`);
  }
  if (!nameSchema.safeParse(pack.name).success) errors.push("El nombre del pack no es válido.");

  // Metadatos del catálogo oficial (FEATURE-003.1).
  if (!isValidVersion(pack.version)) {
    errors.push(`Versión no válida en el pack "${pack.id}": "${pack.version}".`);
  }
  if (!isValidVersion(pack.compatibility.minEngineVersion)) {
    errors.push(`Versión mínima de engine no válida en el pack "${pack.id}".`);
  }
  if (!pack.compatibility.engine) errors.push(`El pack "${pack.id}" no declara engine.`);
  if (!pack.author?.trim()) errors.push(`El pack "${pack.id}" no declara autor.`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(pack.publishedAt)) {
    errors.push(`Fecha de publicación no válida en el pack "${pack.id}".`);
  }


  const groupCodes = new Set(pack.groups.map((g) => g.code));
  if (groupCodes.size !== pack.groups.length) errors.push("Hay códigos de grupo duplicados.");

  const metricCodes = new Set(pack.metrics.map((m) => m.code));
  if (metricCodes.size !== pack.metrics.length) errors.push("Hay códigos de métrica duplicados.");

  for (const metric of pack.metrics) {
    if (!groupCodes.has(metric.group)) {
      errors.push(`La métrica "${metric.code}" referencia un grupo inexistente ("${metric.group}").`);
    }
    if (metric.nature === "derived" && !metric.formula) {
      errors.push(`La métrica derivada "${metric.code}" no tiene fórmula.`);
    }
    if (metric.nature === "primary" && metric.formula) {
      errors.push(`La métrica primaria "${metric.code}" no puede tener fórmula.`);
    }
  }

  // Las fórmulas se validan con el mismo motor que usa el editor.
  const refs: CatalogMetricRef[] = pack.metrics.map((m) => ({
    id: m.code,
    code: m.code,
    nature: m.nature,
    status: "active",
  }));
  const accepted: ExistingFormula[] = [];
  for (const metric of pack.metrics) {
    if (metric.nature !== "derived" || !metric.formula) continue;
    const target = refs.find((r) => r.code === metric.code)!;
    const check = checkFormula(metric.formula, target, refs, accepted);
    if (!check.ok || !check.ast) {
      errors.push(`Fórmula inválida en "${metric.code}": ${check.errors.join(" ")}`);
    } else {
      accepted.push({ metricCode: metric.code, ast: check.ast });
    }
  }

  for (const profile of pack.profiles) {
    if (profile.weights.length === 0) {
      errors.push(`El perfil "${profile.code}" no define pesos.`);
    }
    const seen = new Set<string>();
    for (const weight of profile.weights) {
      if (!metricCodes.has(weight.metric)) {
        errors.push(`El perfil "${profile.code}" pesa una métrica inexistente ("${weight.metric}").`);
      }
      if (seen.has(weight.metric)) {
        errors.push(`El perfil "${profile.code}" repite el peso de "${weight.metric}".`);
      }
      seen.add(weight.metric);
      if (!(weight.weight > 0) || weight.weight > 1000) {
        errors.push(`Peso fuera de rango en "${profile.code}" / "${weight.metric}".`);
      }
      if (weight.sign !== 1 && weight.sign !== -1) {
        errors.push(`Signo no válido en "${profile.code}" / "${weight.metric}".`);
      }
    }
  }

  return errors;
}
