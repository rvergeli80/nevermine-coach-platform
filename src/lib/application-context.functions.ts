import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { loadContextCandidates } from "@/lib/application-context-middleware";
import {
  CONTEXT_FORBIDDEN_MESSAGE,
  resolveApplicationContext,
} from "@/modules/application-context";

/* --------------------------- Contexto de aplicación -------------------------- */
/* FEATURE-002.5: obtener, establecer y validar el SportSpace activo.            */

const activateSchema = z.object({ sportSpaceId: z.string().uuid() });

/** Contexto activo + SportSpaces seleccionables (sólo donde hay Membership). */
export const getApplicationContext = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { readRequestedSportSpaceId, writeActiveSportSpaceId } = await import(
      "@/lib/application-context.server"
    );
    const { candidates, spaces } = await loadContextCandidates(
      context.supabase as never,
      context.userId,
    );
    const resolution = resolveApplicationContext({
      candidates,
      requestedSportSpaceId: readRequestedSportSpaceId(),
    });

    if (resolution.status === "resolved") {
      // Contexto derivado por defecto: se fija para el resto de la sesión.
      if (!resolution.requested) writeActiveSportSpaceId(resolution.sportSpaceId);
      return { status: "resolved" as const, activeSportSpaceId: resolution.sportSpaceId, spaces };
    }

    return { status: resolution.status, activeSportSpaceId: null, spaces };
  });

/** Cambia el SportSpace activo. No modifica Memberships, permisos ni datos. */
export const setApplicationContext = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => activateSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { writeActiveSportSpaceId } = await import("@/lib/application-context.server");
    const { candidates, spaces } = await loadContextCandidates(
      context.supabase as never,
      context.userId,
    );
    const resolution = resolveApplicationContext({
      candidates,
      requestedSportSpaceId: data.sportSpaceId,
    });

    if (resolution.status !== "resolved") throw new Error(CONTEXT_FORBIDDEN_MESSAGE);

    writeActiveSportSpaceId(resolution.sportSpaceId);
    return { status: "resolved" as const, activeSportSpaceId: resolution.sportSpaceId, spaces };
  });
