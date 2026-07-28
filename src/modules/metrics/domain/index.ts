/**
 * Punto de entrada del dominio de métricas.
 * Capa pura: sin React, sin acceso a datos, sin conocimiento del deporte.
 */
export * from "./types";
export * from "./formula/ast";
export * from "./formula/parser";
export * from "./formula/evaluator";
export * from "./valuation";
