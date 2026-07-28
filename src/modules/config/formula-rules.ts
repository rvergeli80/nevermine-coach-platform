import {
  collectDependencies,
  parseFormula,
  validateFormulaGraph,
  type FormulaNode,
} from "@/modules/metrics/domain";

/**
 * Reglas de negocio del motor de fórmulas (Fase 1B).
 * Módulo puro y client-safe: lo usan tanto las server functions como el editor
 * en el navegador, de modo que la validación mostrada al usuario es exactamente
 * la que se aplica al guardar.
 */

export type FormulaNullPolicy = "zero" | "propagate";

export interface CatalogMetricRef {
  id: string;
  code: string;
  nature: "primary" | "derived";
  status: string;
}

export interface ExistingFormula {
  metricCode: string;
  ast: FormulaNode;
}

export interface FormulaCheck {
  ok: boolean;
  ast: FormulaNode | null;
  dependencies: string[];
  errors: string[];
}

/**
 * Valida una expresión contra el catálogo: sintaxis, existencia de las métricas
 * referenciadas, auto-referencia y ciclos con el resto de fórmulas de la versión.
 */
export function checkFormula(
  expression: string,
  target: CatalogMetricRef,
  metrics: readonly CatalogMetricRef[],
  otherFormulas: readonly ExistingFormula[],
): FormulaCheck {
  const errors: string[] = [];

  if (target.nature !== "derived") {
    errors.push("Sólo las métricas derivadas pueden tener fórmula.");
  }

  let ast: FormulaNode;
  try {
    ast = parseFormula(expression);
  } catch (error) {
    return {
      ok: false,
      ast: null,
      dependencies: [],
      errors: [...errors, error instanceof Error ? error.message : "Expresión no válida."],
    };
  }

  const dependencies = collectDependencies(ast);
  const active = new Set(metrics.filter((m) => m.status === "active").map((m) => m.code));

  for (const dep of dependencies) {
    if (dep === target.code) {
      errors.push(`Una métrica no puede referirse a sí misma ("${dep}").`);
    } else if (!active.has(dep)) {
      errors.push(`La métrica "${dep}" no existe o no está activa en este catálogo.`);
    }
  }

  const graphIssues = validateFormulaGraph(
    [...otherFormulas, { metricCode: target.code, ast }],
    active,
  ).filter((issue) => issue.message.startsWith("Ciclo"));

  for (const issue of graphIssues) errors.push(issue.message);

  return { ok: errors.length === 0, ast, dependencies, errors };
}

/**
 * Comprobación previa a publicar: toda métrica derivada activa necesita fórmula
 * en la versión y el grafo completo debe ser resoluble.
 */
export function checkVersionFormulas(
  metrics: readonly CatalogMetricRef[],
  formulas: readonly ExistingFormula[],
): string[] {
  const errors: string[] = [];
  const active = metrics.filter((m) => m.status === "active");
  const withFormula = new Set(formulas.map((f) => f.metricCode));

  for (const metric of active) {
    if (metric.nature === "derived" && !withFormula.has(metric.code)) {
      errors.push(`La métrica derivada "${metric.code}" no tiene fórmula definida.`);
    }
  }

  const issues = validateFormulaGraph(formulas, new Set(active.map((m) => m.code)));
  for (const issue of issues) errors.push(`${issue.code}: ${issue.message}`);

  return errors;
}
