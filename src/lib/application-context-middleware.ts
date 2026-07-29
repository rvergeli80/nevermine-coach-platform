import { createMiddleware } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  CONTEXT_EMPTY_MESSAGE,
  CONTEXT_FORBIDDEN_MESSAGE,
  resolveApplicationContext,
  type ContextCandidate,
} from "@/modules/application-context";

/**
 * FEATURE-002.5 — Capa de aplicación del contexto activo.
 *
 * Aquí (y sólo aquí) vive el mecanismo de transporte del contexto: una cookie
 * de sesión. El dominio consume `ApplicationContext` y nunca conoce cookies,
 * cabeceras ni JWT.
 */

type SupabaseClient = {
  from: (table: string) => any;
};

type MembershipRow = {
  sport_space_id: string;
  role: ContextCandidate["role"];
  created_at: string;
  sport_spaces: { name: string; slug: string; type: string; status: string } | null;
};

export interface AvailableSportSpace {
  id: string;
  name: string;
  slug: string;
  role: ContextCandidate["role"];
}

/** Memberships válidas del usuario, base de todo contexto posible. */
export async function loadContextCandidates(supabase: SupabaseClient, userId: string) {
  const { data, error } = await supabase
    .from("sport_space_members")
    .select("sport_space_id, role, created_at, sport_spaces(name, slug, type, status)")
    .eq("user_id", userId)
    .order("created_at");

  if (error) throw new Error(error.message);

  const rows = (data ?? []) as MembershipRow[];
  const candidates: ContextCandidate[] = rows.map((row) => ({
    sportSpaceId: row.sport_space_id,
    role: row.role,
    joinedAt: row.created_at,
  }));
  const spaces: AvailableSportSpace[] = rows.map((row) => ({
    id: row.sport_space_id,
    name: row.sport_spaces?.name ?? "SportSpace",
    slug: row.sport_spaces?.slug ?? "",
    role: row.role,
  }));

  return { candidates, spaces };
}

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
      context.supabase as unknown as SupabaseClient,
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
