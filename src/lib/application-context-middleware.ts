import { createMiddleware } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  CONTEXT_EMPTY_MESSAGE,
  CONTEXT_FORBIDDEN_MESSAGE,
  resolveApplicationContext,
} from "@/modules/application-context";
import { loadContextCandidates } from "@/lib/application-context-repository";

/**
 * FEATURE-002.5 — Capa de aplicación del contexto activo (canal HTTP).
 *
 * Aquí (y sólo aquí) vive el mecanismo de transporte del contexto web: una
 * cookie de sesión. El dominio consume `ApplicationContext` y nunca conoce
 * cookies, cabeceras ni JWT. MCP usa el mismo repositorio y las mismas reglas
 * de resolución con otro transporte (FEATURE-002.6).
 */

export { loadContextCandidates };
export type { AvailableSportSpace } from "@/lib/application-context-repository";

/**
 * Middleware de contexto: exige sesión y un SportSpace activo válido.
 * Expone `sportSpaceId` a los servicios, que ya no derivan el ámbito de
 * `owner_id` ni lo reciben del cliente.
 */
export const requireApplicationContext = createMiddleware({ type: "function" })
  .middleware([requireSupabaseAuth])
  .server(async ({ next, context }) => {
    const { readRequestedSportSpaceId } = await import("@/lib/application-context.server");
    const { candidates } = await loadContextCandidates(
      context.supabase as never,
      context.userId,
    );
    const resolution = resolveApplicationContext({
      candidates,
      requestedSportSpaceId: readRequestedSportSpaceId(),
    });

    if (resolution.status === "forbidden") throw new Error(CONTEXT_FORBIDDEN_MESSAGE);
    if (resolution.status === "empty") throw new Error(CONTEXT_EMPTY_MESSAGE);

    return next({ context: { sportSpaceId: resolution.sportSpaceId } });
  });
