import { createClient } from "@supabase/supabase-js";
import type { ToolContext } from "@lovable.dev/mcp-js";

import type { Database } from "@/integrations/supabase/types";

/**
 * Cliente Supabase que actúa como el usuario autenticado del cliente MCP:
 * las políticas RLS se aplican con su identidad, nunca con claves privilegiadas.
 */
export function supabaseForUser(ctx: ToolContext) {
  return createClient<Database>(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_PUBLISHABLE_KEY!,
    {
      global: { headers: { Authorization: `Bearer ${ctx.getToken()}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    },
  );
}

export function unauthenticated() {
  return {
    content: [{ type: "text" as const, text: "No autenticado." }],
    isError: true,
  };
}

export function failure(message: string) {
  return { content: [{ type: "text" as const, text: message }], isError: true };
}

export function rows(data: unknown) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(data) }],
    structuredContent: { items: data },
  };
}
