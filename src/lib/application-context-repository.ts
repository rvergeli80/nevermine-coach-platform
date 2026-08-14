import type { ContextCandidate } from "@/modules/application-context";

/**
 * FEATURE-002.6 — Lectura de Memberships, independiente del canal.
 *
 * La usan por igual el middleware HTTP y el runtime MCP: ambos construyen el
 * ApplicationContext a partir de las mismas Memberships y las mismas reglas.
 */

type DataClient = { from: (table: string) => any };

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
export async function loadContextCandidates(supabase: DataClient, userId: string) {
  const { withClockSkewRetry } = await import("@/lib/jwt-skew.server");
  const { data, error } = await withClockSkewRetry(() =>
    supabase
      .from("sport_space_members")
      .select("sport_space_id, role, created_at, sport_spaces(name, slug, type, status)")
      .eq("user_id", userId)
      .order("created_at"),
  );

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
