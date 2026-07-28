import { FORMULA_FUNCTIONS, isFormulaFunction, type FormulaNode } from "./ast";

/**
 * Analizador de expresiones textuales -> árbol de fórmula.
 * Gramática: números, códigos de métrica, + - * / , paréntesis y funciones.
 * Nunca usa eval: no ejecuta código arbitrario.
 */

export class FormulaSyntaxError extends Error {
  constructor(
    message: string,
    readonly position: number,
  ) {
    super(message);
    this.name = "FormulaSyntaxError";
  }
}

type Token =
  | { type: "number"; value: number; pos: number }
  | { type: "ident"; value: string; pos: number }
  | { type: "op"; value: "+" | "-" | "*" | "/"; pos: number }
  | { type: "punct"; value: "(" | ")" | ","; pos: number };

const IDENT_RE = /[A-Za-z_][A-Za-z0-9_.]*/y;
const NUMBER_RE = /\d+(\.\d+)?/y;

function tokenize(input: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < input.length) {
    const char = input[i];
    if (/\s/.test(char)) {
      i += 1;
      continue;
    }
    if ("+-*/".includes(char)) {
      tokens.push({ type: "op", value: char as "+" | "-" | "*" | "/", pos: i });
      i += 1;
      continue;
    }
    if ("(),".includes(char)) {
      tokens.push({ type: "punct", value: char as "(" | ")" | ",", pos: i });
      i += 1;
      continue;
    }
    NUMBER_RE.lastIndex = i;
    const num = NUMBER_RE.exec(input);
    if (num) {
      tokens.push({ type: "number", value: Number(num[0]), pos: i });
      i += num[0].length;
      continue;
    }
    IDENT_RE.lastIndex = i;
    const ident = IDENT_RE.exec(input);
    if (ident) {
      tokens.push({ type: "ident", value: ident[0], pos: i });
      i += ident[0].length;
      continue;
    }
    throw new FormulaSyntaxError(`Carácter no permitido: "${char}"`, i);
  }
  return tokens;
}

export function parseFormula(expression: string): FormulaNode {
  const tokens = tokenize(expression);
  let cursor = 0;
  const endPos = expression.length;

  const peek = (): Token | undefined => tokens[cursor];
  const next = (): Token | undefined => tokens[cursor++];

  const isPunct = (token: Token | undefined, value: "(" | ")" | ","): boolean =>
    token?.type === "punct" && token.value === value;

  function expectPunct(value: "(" | ")" | ","): void {
    const token = next();
    if (!isPunct(token, value)) {
      throw new FormulaSyntaxError(`Se esperaba "${value}"`, token?.pos ?? endPos);
    }
  }

  function parsePrimary(): FormulaNode {
    const token = next();
    if (!token) throw new FormulaSyntaxError("Expresión incompleta", endPos);

    if (token.type === "number") return { kind: "number", value: token.value };

    if (token.type === "op" && token.value === "-") {
      return { kind: "unary", op: "-", operand: parsePrimary() };
    }

    if (token.type === "punct" && token.value === "(") {
      const inner = parseAdditive();
      expectPunct(")");
      return inner;
    }

    if (token.type === "ident") {
      if (isPunct(peek(), "(")) {
        if (!isFormulaFunction(token.value)) {
          throw new FormulaSyntaxError(`Función desconocida: "${token.value}"`, token.pos);
        }
        expectPunct("(");
        const args: FormulaNode[] = [];
        if (!isPunct(peek(), ")")) {
          args.push(parseAdditive());
          while (isPunct(peek(), ",")) {
            next();
            args.push(parseAdditive());
          }
        }
        expectPunct(")");
        const [minArity, maxArity] = FORMULA_FUNCTIONS[token.value].arity;
        if (args.length < minArity || args.length > maxArity) {
          throw new FormulaSyntaxError(
            `La función "${token.value}" no admite ${args.length} argumentos`,
            token.pos,
          );
        }
        return { kind: "call", name: token.value, args };
      }
      return { kind: "metric", code: token.value };
    }

    throw new FormulaSyntaxError("Expresión no válida", token.pos);
  }

  function parseMultiplicative(): FormulaNode {
    let left = parsePrimary();
    for (;;) {
      const token = peek();
      if (token?.type === "op" && (token.value === "*" || token.value === "/")) {
        next();
        left = { kind: "binary", op: token.value, left, right: parsePrimary() };
        continue;
      }
      return left;
    }
  }

  function parseAdditive(): FormulaNode {
    let left = parseMultiplicative();
    for (;;) {
      const token = peek();
      if (token?.type === "op" && (token.value === "+" || token.value === "-")) {
        next();
        left = { kind: "binary", op: token.value, left, right: parseMultiplicative() };
        continue;
      }
      return left;
    }
  }

  if (tokens.length === 0) throw new FormulaSyntaxError("La fórmula está vacía", 0);
  const ast = parseAdditive();
  const trailing = peek();
  if (trailing) throw new FormulaSyntaxError("Contenido sobrante en la fórmula", trailing.pos);
  return ast;
}

/** Representación textual canónica del árbol (para un futuro editor visual). */
export function formulaToExpression(node: FormulaNode): string {
  switch (node.kind) {
    case "number":
      return String(node.value);
    case "metric":
      return node.code;
    case "unary":
      return `-${formulaToExpression(node.operand)}`;
    case "binary":
      return `(${formulaToExpression(node.left)} ${node.op} ${formulaToExpression(node.right)})`;
    case "call":
      return `${node.name}(${node.args.map(formulaToExpression).join(", ")})`;
  }
}
