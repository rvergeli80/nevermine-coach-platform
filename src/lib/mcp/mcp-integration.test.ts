import { createClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";

import { contextualTool, resolveMcpApplicationContext, type McpRuntime } from "./application-context";
import type { ToolExecutionEntry } from "./execution-log";
import { listCatalogsService, listSeasonsService } from "@/lib/services/config.service";
import type { DataClient } from "@/lib/services/service-context";

/**
 * FEATURE-002.6 — Test de integración MCP ↔ base de datos real.
 *
 * Ejecuta las Tools contra Supabase con la sesión de pruebas inyectada y
 * comprueba que MCP obtiene exactamente el mismo resultado que la web al
 * invocar el mismo Application Service con el mismo contexto (paridad de canal)
 * y que RLS sigue siendo la autorización efectiva.
 */

const url = process.env.VITE_SUPABASE_URL ?? process.env.SUPABASE_URL;
const anonKey =
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? process.env.SUPABASE_PUBLISHABLE_KEY;
const accessToken = process.env.LOVABLE_BROWSER_SUPABASE_ACCESS_TOKEN;
const sessionUserId = (() => {
  if (!accessToken) return null;
  try {
    const payload = JSON.parse(
      Buffer.from(accessToken.split(".")[1], "base64").toString("utf8"),
    ) as { sub?: string };
    return payload.sub ?? null;
  } catch {
    return null;
  }
})();

const enabled = Boolean(url && anonKey && accessToken && sessionUserId);

function realClient(): DataClient {
  return createClient(url!, anonKey!, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  }) as unknown as DataClient;
}

function toolContext(sportSpaceId?: string) {
  return {
    isAuthenticated: () => true,
    getUserId: () => sessionUserId,
    getClaims: () => (sportSpaceId ? { sportSpaceId } : {}),
    getToken: () => accessToken!,
  } as any;
}

function runtime(log: ToolExecutionEntry[] = []): McpRuntime {
  return { createClient: () => realClient(), log: (entry) => log.push(entry), now: () => new Date() };
}

describe.skipIf(!enabled)("MCP sobre datos reales", () => {
  it("resuelve el SportSpace activo desde la Membership real del usuario", async () => {
    const resolved = await resolveMcpApplicationContext(toolContext(), runtime());
    expect(resolved.ok).toBe(true);
    if (resolved.ok) {
      expect(resolved.context.userId).toBe(sessionUserId);
      expect(resolved.context.sportSpaceId).toMatch(/^[0-9a-f-]{36}$/);
    }
  });

  it("devuelve por MCP lo mismo que la web para el mismo contexto", async () => {
    const resolved = await resolveMcpApplicationContext(toolContext(), runtime());
    if (!resolved.ok) throw new Error(resolved.message);

    const viaWeb = await listSeasonsService(resolved.context);
    const handler = contextualTool("list_seasons", (_i, ctx) => listSeasonsService(ctx), runtime());
    const viaMcp: any = await handler({}, toolContext());

    expect(viaMcp.isError).toBeUndefined();
    expect(viaMcp.structuredContent ?? JSON.parse(viaMcp.content[0].text)).toEqual(
      JSON.parse(JSON.stringify(viaWeb)),
    );
  });

  it("todo lo devuelto pertenece al SportSpace activo", async () => {
    const resolved = await resolveMcpApplicationContext(toolContext(), runtime());
    if (!resolved.ok) throw new Error(resolved.message);

    const [seasons, catalogs] = await Promise.all([
      listSeasonsService(resolved.context),
      listCatalogsService(resolved.context),
    ]);
    for (const row of [...seasons, ...catalogs]) {
      expect(row.sport_space_id).toBe(resolved.context.sportSpaceId);
    }
  });

  it("rechaza un SportSpace sin Membership y no ejecuta la Tool", async () => {
    const log: ToolExecutionEntry[] = [];
    const handler = contextualTool("list_seasons", (_i, ctx) => listSeasonsService(ctx), runtime(log));
    const result: any = await handler(
      {},
      toolContext("00000000-0000-0000-0000-000000000000"),
    );
    expect(result.isError).toBe(true);
    expect(log[0]).toMatchObject({ outcome: "error", error: "forbidden" });
  });

  it("registra cada ejecución con canal, usuario y SportSpace", async () => {
    const log: ToolExecutionEntry[] = [];
    const handler = contextualTool("list_catalogs", (_i, ctx) => listCatalogsService(ctx), runtime(log));
    await handler({}, toolContext());
    expect(log[0]).toMatchObject({ channel: "mcp", tool: "list_catalogs", userId: sessionUserId });
    expect(log[0].sportSpaceId).toBeTruthy();
    expect(typeof log[0].durationMs).toBe("number");
  });
});
