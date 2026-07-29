import type { ToolContext } from "@lovable.dev/mcp-js";

import { loadContextCandidates } from "@/lib/application-context-repository";
import type { ApplicationServiceContext, DataClient } from "@/lib/services/service-context";
import {
  CONTEXT_EMPTY_MESSAGE,
  CONTEXT_FORBIDDEN_MESSAGE,
  resolveApplicationContext,
} from "@/modules/application-context";
import {
  consoleToolExecutionLogger,
  type ToolExecutionLogger,
} from "./execution-log";
import { failure, rows, supabaseForUser, unauthenticated } from "./supabase";

/**
 * FEATURE-002.6 — Resolución del ApplicationContext en el canal MCP.
 *
 * Mismo flujo que HTTP: identidad autenticada → Memberships → resolución del
 * SportSpace activo → ApplicationContext. La única diferencia es el transporte
 * (token del cliente MCP en lugar de cookie de sesión). Las Tools reciben el
 * contexto ya resuelto y no pueden abrir conexiones ni decidir permisos.
 */

export const ACTIVE_SPORT_SPACE_HEADER_CLAIM = "sportSpaceId";

export interface McpRuntime {
  /** Cliente de datos que actúa como el usuario autenticado (RLS aplicada). */
  createClient: (ctx: ToolContext) => DataClient;
  log: ToolExecutionLogger;
  now: () => Date;
}

export const defaultMcpRuntime: McpRuntime = {
  createClient: (ctx) => supabaseForUser(ctx) as unknown as DataClient,
  log: consoleToolExecutionLogger,
  now: () => new Date(),
};

/**
 * Construye el ApplicationContext del canal MCP.
 * Devuelve un error controlado si no hay identidad o no hay Membership.
 */
export async function resolveMcpApplicationContext(
  ctx: ToolContext,
  runtime: McpRuntime = defaultMcpRuntime,
): Promise<
  | { ok: true; context: ApplicationServiceContext }
  | { ok: false; reason: "unauthenticated" | "empty" | "forbidden"; message: string }
> {
  if (!ctx.isAuthenticated()) {
    return { ok: false, reason: "unauthenticated", message: "No autenticado." };
  }

  const userId = ctx.getUserId()!;
  const supabase = runtime.createClient(ctx);
  const { candidates } = await loadContextCandidates(supabase, userId);

  // El cliente MCP puede solicitar un SportSpace concreto vía claims; se valida
  // contra las Memberships con exactamente las mismas reglas que la web.
  const claims = (ctx.getClaims?.() ?? {}) as Record<string, unknown>;
  const requested = claims[ACTIVE_SPORT_SPACE_HEADER_CLAIM];

  const resolution = resolveApplicationContext({
    candidates,
    requestedSportSpaceId: typeof requested === "string" ? requested : null,
  });

  if (resolution.status === "forbidden") {
    return { ok: false, reason: "forbidden", message: CONTEXT_FORBIDDEN_MESSAGE };
  }
  if (resolution.status === "empty") {
    return { ok: false, reason: "empty", message: CONTEXT_EMPTY_MESSAGE };
  }

  return {
    ok: true,
    context: { userId, sportSpaceId: resolution.sportSpaceId, supabase },
  };
}

/**
 * Envuelve un Application Service como handler de Tool MCP: resuelve el
 * contexto, ejecuta el servicio compartido con la web y registra la ejecución.
 */
export function contextualTool<Input>(
  toolName: string,
  run: (input: Input, context: ApplicationServiceContext) => Promise<unknown>,
  runtime: McpRuntime = defaultMcpRuntime,
) {
  return async (input: Input, ctx: ToolContext) => {
    const resolved = await resolveMcpApplicationContext(ctx, runtime);

    if (!resolved.ok) {
      runtime.log({
        channel: "mcp",
        tool: toolName,
        userId: ctx.isAuthenticated() ? (ctx.getUserId() ?? null) : null,
        sportSpaceId: null,
        at: runtime.now().toISOString(),
        outcome: "error",
        error: resolved.reason,
      });
      return resolved.reason === "unauthenticated" ? unauthenticated() : failure(resolved.message);
    }

    const { context } = resolved;
    try {
      const result = await run(input, context);
      runtime.log({
        channel: "mcp",
        tool: toolName,
        userId: context.userId,
        sportSpaceId: context.sportSpaceId,
        at: runtime.now().toISOString(),
        outcome: "success",
      });
      return rows(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      runtime.log({
        channel: "mcp",
        tool: toolName,
        userId: context.userId,
        sportSpaceId: context.sportSpaceId,
        at: runtime.now().toISOString(),
        outcome: "error",
        error: message,
      });
      return failure(message);
    }
  };
}
