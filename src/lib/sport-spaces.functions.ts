import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { unwrap } from "@/lib/supabase-result";
import { createSportSpaceSchema, sportSpaceIdSchema } from "@/modules/sport-space/schemas";
import type { SportSpace } from "@/modules/sport-space/types";

/* ------------------------------- SportSpaces ------------------------------- */
/* FEATURE-002.4: alta y lectura. La autorización es exclusivamente RLS sobre  */
/* Membership; estas funciones no filtran por propiedad. `created_by` es un    */
/* dato histórico de auditoría (sólo habilita la ventana de arranque previa a  */
/* la primera membresía).                                                      */

const COLUMNS = "id, slug, name, description, type, status, created_by, created_at, updated_at";

type SportSpaceRow = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  type: SportSpace["type"];
  status: SportSpace["status"];
  created_by: string;
  created_at: string;
  updated_at: string;
};

function toSportSpace(row: SportSpaceRow): SportSpace {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    description: row.description,
    type: row.type,
    status: row.status,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export const listSportSpaces = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const rows = unwrap(
      await context.supabase.from("sport_spaces").select(COLUMNS).order("name"),
    ) as SportSpaceRow[];
    return rows.map(toSportSpace);
  });

export const getSportSpace = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => sportSpaceIdSchema.parse(data))
  .handler(async ({ data, context }) => {
    const row = unwrap(
      await context.supabase
        .from("sport_spaces")
        .select(COLUMNS)
        .eq("id", data.sportSpaceId)
        .maybeSingle(),
    ) as SportSpaceRow | null;
    return row ? toSportSpace(row) : null;
  });

export const createSportSpace = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => createSportSpaceSchema.parse(data))
  .handler(async ({ data, context }) => {
    const row = unwrap(
      await context.supabase
        .from("sport_spaces")
        .insert({
          slug: data.slug,
          name: data.name,
          description: data.description,
          type: data.type,
          created_by: context.userId,
        })
        .select(COLUMNS)
        .single(),
    ) as SportSpaceRow;
    return toSportSpace(row);
  });
