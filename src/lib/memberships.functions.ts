import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { unwrap } from "@/lib/supabase-result";
import {
  addMembershipSchema,
  membershipIdSchema,
  sportSpaceMembersSchema,
  updateMembershipRoleSchema,
} from "@/modules/sport-space/membership-schemas";
import type { Membership } from "@/modules/sport-space/membership-types";

/* ------------------------------- Membership ------------------------------- */
/* FEATURE-002.4: la pertenencia usuario ↔ SportSpace es la única fuente de    */
/* autorización, aplicada por RLS en base de datos.                            */
/* Las invariantes (primer miembro Owner, último Owner protegido)              */
/* están además garantizadas por triggers en base de datos.                    */

const COLUMNS = "id, sport_space_id, user_id, role, created_at, updated_at";

type MembershipRow = {
  id: string;
  sport_space_id: string;
  user_id: string;
  role: Membership["role"];
  created_at: string;
  updated_at: string;
};

function toMembership(row: MembershipRow): Membership {
  return {
    id: row.id,
    sportSpaceId: row.sport_space_id,
    userId: row.user_id,
    role: row.role,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** Miembros de un SportSpace concreto. */
export const listSportSpaceMembers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => sportSpaceMembersSchema.parse(data))
  .handler(async ({ data, context }) => {
    const rows = unwrap(
      await context.supabase
        .from("sport_space_members")
        .select(COLUMNS)
        .eq("sport_space_id", data.sportSpaceId)
        .order("created_at"),
    ) as MembershipRow[];
    return rows.map(toMembership);
  });

/** SportSpaces a los que pertenece el usuario autenticado. */
export const listMyMemberships = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const rows = unwrap(
      await context.supabase
        .from("sport_space_members")
        .select(COLUMNS)
        .eq("user_id", context.userId)
        .order("created_at"),
    ) as MembershipRow[];
    return rows.map(toMembership);
  });

export const addSportSpaceMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => addMembershipSchema.parse(data))
  .handler(async ({ data, context }) => {
    const row = unwrap(
      await context.supabase
        .from("sport_space_members")
        .insert({
          sport_space_id: data.sportSpaceId,
          user_id: data.userId,
          role: data.role,
        })
        .select(COLUMNS)
        .single(),
    ) as MembershipRow;
    return toMembership(row);
  });

export const updateSportSpaceMemberRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => updateMembershipRoleSchema.parse(data))
  .handler(async ({ data, context }) => {
    const row = unwrap(
      await context.supabase
        .from("sport_space_members")
        .update({ role: data.role })
        .eq("id", data.id)
        .select(COLUMNS)
        .single(),
    ) as MembershipRow;
    return toMembership(row);
  });

export const removeSportSpaceMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => membershipIdSchema.parse(data))
  .handler(async ({ data, context }) => {
    unwrap(await context.supabase.from("sport_space_members").delete().eq("id", data.id));
    return { id: data.id };
  });
