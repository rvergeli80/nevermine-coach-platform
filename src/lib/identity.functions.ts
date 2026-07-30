import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { withClockSkewRetry } from "@/lib/jwt-skew.server";
import type { AppRole, CurrentUser } from "@/modules/identity/types";

/**
 * Identidad del usuario autenticado.
 * Módulo delgado: sólo declaraciones de server functions.
 */
export const getCurrentUser = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<CurrentUser> => {
    const { supabase, userId } = context;

    const [{ data: profile, error: profileError }, { data: roles, error: rolesError }] =
      await Promise.all([
        withClockSkewRetry(() =>
          supabase
            .from("profiles")
            .select("id, email, full_name, locale")
            .eq("id", userId)
            .maybeSingle(),
        ),
        withClockSkewRetry(() => supabase.from("user_roles").select("role").eq("user_id", userId)),
      ]);

    if (profileError) throw new Error(profileError.message);

    if (rolesError) throw new Error(rolesError.message);

    return {
      profile: {
        id: userId,
        email: profile?.email ?? null,
        fullName: profile?.full_name ?? null,
        locale: profile?.locale ?? "es",
      },
      roles: (roles ?? []).map((row) => row.role as AppRole),
    };
  });
