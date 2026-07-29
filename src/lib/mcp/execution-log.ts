/**
 * FEATURE-002.6 — Registro básico de ejecución de Tools MCP.
 *
 * Punto de integración preparado para la auditoría avanzada (fuera de alcance).
 * Nunca registra tokens ni datos de negocio.
 */

export interface ToolExecutionEntry {
  channel: "mcp";
  tool: string;
  userId: string | null;
  sportSpaceId: string | null;
  at: string;
  outcome: "success" | "error";
  error?: string;
}

export type ToolExecutionLogger = (entry: ToolExecutionEntry) => void;

export const consoleToolExecutionLogger: ToolExecutionLogger = (entry) => {
  console.info("[mcp:tool]", JSON.stringify(entry));
};
