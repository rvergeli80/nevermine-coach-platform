/**
 * Árbol de expresión de una fórmula.
 *
 * Se persiste como JSON (`metric_formulas.ast`). La expresión textual de la V1
 * y un futuro editor visual son sólo dos productores del mismo árbol: el motor
 * de evaluación no cambia al sustituir el editor.
 */

export type FormulaNode =
  | { kind: "number"; value: number }
  | { kind: "metric"; code: string }
  | { kind: "unary"; op: "-"; operand: FormulaNode }
  | { kind: "binary"; op: "+" | "-" | "*" | "/"; left: FormulaNode; right: FormulaNode }
  | { kind: "call"; name: FormulaFunctionName; args: FormulaNode[] };

export const FORMULA_FUNCTIONS = {
  min: { arity: [2, Number.POSITIVE_INFINITY] as const },
  max: { arity: [2, Number.POSITIVE_INFINITY] as const },
  abs: { arity: [1, 1] as const },
  round: { arity: [1, 2] as const },
  safe_div: { arity: [2, 3] as const },
} satisfies Record<string, { arity: readonly [number, number] }>;

export type FormulaFunctionName = keyof typeof FORMULA_FUNCTIONS;

export function isFormulaFunction(name: string): name is FormulaFunctionName {
  return Object.prototype.hasOwnProperty.call(FORMULA_FUNCTIONS, name);
}

/** Códigos de métrica referenciados por el árbol, sin duplicados. */
export function collectDependencies(node: FormulaNode): string[] {
  const found = new Set<string>();
  const walk = (n: FormulaNode): void => {
    switch (n.kind) {
      case "metric":
        found.add(n.code);
        break;
      case "unary":
        walk(n.operand);
        break;
      case "binary":
        walk(n.left);
        walk(n.right);
        break;
      case "call":
        n.args.forEach(walk);
        break;
      default:
        break;
    }
  };
  walk(node);
  return [...found];
}
