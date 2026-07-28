import { collectDependencies, type FormulaNode } from "./ast";

/**
 * Evaluador de fórmulas y validación semántica.
 * Las métricas derivadas nunca se almacenan: se calculan siempre aquí.
 */

export type NullPolicy = "zero" | "propagate";

export interface EvaluationContext {
  /** Valores de métricas primarias indexados por código. */
  values: Readonly<Record<string, number | null | undefined>>;
  nullPolicy?: NullPolicy;
}

export function evaluateFormula(node: FormulaNode, context: EvaluationContext): number | null {
  const policy = context.nullPolicy ?? "zero";

  const resolve = (n: FormulaNode): number | null => {
    switch (n.kind) {
      case "number":
        return n.value;
      case "metric": {
        const raw = context.values[n.code];
        if (raw === null || raw === undefined) return policy === "zero" ? 0 : null;
        return raw;
      }
      case "unary": {
        const operand = resolve(n.operand);
        return operand === null ? null : -operand;
      }
      case "binary": {
        const left = resolve(n.left);
        const right = resolve(n.right);
        if (left === null || right === null) return null;
        switch (n.op) {
          case "+":
            return left + right;
          case "-":
            return left - right;
          case "*":
            return left * right;
          case "/":
            return right === 0 ? null : left / right;
        }
        return null;
      }
      case "call": {
        const args = n.args.map(resolve);
        if (n.name === "safe_div") {
          const [a, b, fallback] = args;
          if (a === null || b === null) return null;
          if (b === 0) return fallback ?? 0;
          return a / b;
        }
        if (args.some((value) => value === null)) return null;
        const numbers = args as number[];
        switch (n.name) {
          case "min":
            return Math.min(...numbers);
          case "max":
            return Math.max(...numbers);
          case "abs":
            return Math.abs(numbers[0]);
          case "round": {
            const factor = 10 ** (numbers[1] ?? 0);
            return Math.round(numbers[0] * factor) / factor;
          }
        }
        return null;
      }
    }
  };

  return resolve(node);
}

export interface SemanticIssue {
  code: string;
  message: string;
}

/**
 * Validación semántica al publicar una versión: toda dependencia debe existir
 * en la versión y no puede haber ciclos entre métricas derivadas.
 */
export function validateFormulaGraph(
  formulas: ReadonlyArray<{ metricCode: string; ast: FormulaNode }>,
  knownMetricCodes: ReadonlySet<string>,
): SemanticIssue[] {
  const issues: SemanticIssue[] = [];
  const graph = new Map<string, string[]>();

  for (const formula of formulas) {
    const deps = collectDependencies(formula.ast);
    graph.set(formula.metricCode, deps);
    for (const dep of deps) {
      if (!knownMetricCodes.has(dep)) {
        issues.push({
          code: formula.metricCode,
          message: `Referencia a una métrica inexistente en la versión: "${dep}"`,
        });
      }
    }
  }

  const state = new Map<string, "visiting" | "done">();
  const detectCycle = (code: string, trail: string[]): void => {
    const current = state.get(code);
    if (current === "done") return;
    if (current === "visiting") {
      issues.push({ code, message: `Ciclo de dependencias: ${[...trail, code].join(" -> ")}` });
      return;
    }
    state.set(code, "visiting");
    for (const dep of graph.get(code) ?? []) detectCycle(dep, [...trail, code]);
    state.set(code, "done");
  };
  for (const code of graph.keys()) detectCycle(code, []);

  return issues;
}
