import { unwrap } from "@/lib/supabase-result";
import { assertCan, type OrgAction, type OrgRole } from "@/modules/sports-organization";
import type { ApplicationServiceContext } from "./service-context";

/**
 * REMEDIATION-004 — Resolución de Authority en la capa de aplicación.
 *
 * El rol se lee siempre de la Membership del SportSpace activo del contexto;
 * nunca llega del cliente ni se deriva de `owner_id`. RLS sigue activa como
 * segunda barrera.
 */

export async function loadOrgRole(ctx: ApplicationServiceContext): Promise<OrgRole | null> {
  const row = unwrap<{ role: OrgRole } | null>(
    await ctx.supabase
      .from("sport_space_members")
      .select("role")
      .eq("sport_space_id", ctx.sportSpaceId)
      .eq("user_id", ctx.userId)
      .maybeSingle(),
  );
  return row?.role ?? null;
}

/** Guard de negocio: lanza si el rol del usuario no permite la acción. */
export async function assertAuthority(
  ctx: ApplicationServiceContext,
  action: OrgAction,
): Promise<OrgRole> {
  const role = await loadOrgRole(ctx);
  assertCan(role, action);
  return role as OrgRole;
}
