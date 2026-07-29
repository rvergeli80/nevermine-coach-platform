import { describe, expect, it } from "vitest";

import { contextualTool, resolveMcpApplicationContext } from "./application-context";
import type { McpRuntime } from "./application-context";
import type { ToolExecutionEntry } from "./execution-log";
import { listSeasonsService } from "@/lib/services/config.service";
import { CONTEXT_EMPTY_MESSAGE, CONTEXT_FORBIDDEN_MESSAGE } from "@/modules/application-context";

/**
 * FEATURE-002.6 — Contexto y ejecución de Tools MCP.
 * Se verifica que MCP reproduce exactamente el modelo de la web: identidad →
 * Membership → SportSpace activo → Application Service, sin owner_id.
 */

type Membership = { sport_space_id: string; role: "owner" | "coach"; created_at: string };

/** Cliente de datos falso con aislamiento por SportSpace (equivalente a RLS). */
function fakeClient(memberships: Membership[], seasonsBySpace: Record<string, unknown[]>) {
  const calls: { table: string; filters: Record<string, unknown>; payload?: unknown }[] = [];
  return {
    calls,
    from(table: string) {
      const state: any = { table, filters: {} as Record<string, unknown>, payload: undefined };
      const builder: any = {
        select: () => builder,
        order: () => builder,
        eq: (col: string, val: unknown) => {
          state.filters[col] = val;
          return builder;
        },
        insert: (payload: unknown) => {
          state.payload = payload;
          return builder;
        },
        single: () => builder,
        maybeSingle: () => builder,
        then: (resolve: (r: any) => unknown) => {
          calls.push({ table, filters: state.filters, payload: state.payload });
          if (table === "sport_space_members") {
            return resolve({
              data: memberships.map((m) => ({ ...m, sport_spaces: { name: "S", slug: "s", type: "club", status: "active" } })),
              error: null,
            });
          }
          if (table === "seasons" && state.payload) {
            const p = state.payload as { sport_space_id: string };
            return resolve({ data: { id: "new", ...p }, error: null });
          }
          if (table === "seasons") {
            return resolve({ data: seasonsBySpace["__active"] ?? [], error: null });
          }
          return resolve({ data: [], error: null });
        },
      };
      return builder;
    },
  };
}

function toolCtx(opts: { userId?: string | null; claims?: Record<string, unknown> } = {}) {
  const userId = opts.userId === undefined ? "user-1" : opts.userId;
  return {
    isAuthenticated: () => userId !== null,
    getUserId: () => userId,
    getClaims: () => opts.claims ?? {},
    getToken: () => "token",
  } as any;
}

function runtimeFor(client: any, log: ToolExecutionEntry[] = []): McpRuntime {
  return {
    createClient: () => client as any,
    log: (entry) => log.push(entry),
    now: () => new Date("2026-01-01T00:00:00.000Z"),
  };
}

const owner: Membership = { sport_space_id: "space-a", role: "owner", created_at: "2025-01-01" };
const coach: Membership = { sport_space_id: "space-b", role: "coach", created_at: "2025-02-01" };

describe("resolveMcpApplicationContext", () => {
  it("resuelve el contexto con Membership válida", async () => {
    const client = fakeClient([owner], {});
    const result = await resolveMcpApplicationContext(toolCtx(), runtimeFor(client));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.context.sportSpaceId).toBe("space-a");
      expect(result.context.userId).toBe("user-1");
    }
  });

  it("rechaza la ejecución sin identidad autenticada", async () => {
    const client = fakeClient([owner], {});
    const result = await resolveMcpApplicationContext(toolCtx({ userId: null }), runtimeFor(client));
    expect(result).toMatchObject({ ok: false, reason: "unauthenticated" });
  });

  it("rechaza a un usuario sin ninguna Membership", async () => {
    const client = fakeClient([], {});
    const result = await resolveMcpApplicationContext(toolCtx(), runtimeFor(client));
    expect(result).toMatchObject({ ok: false, reason: "empty", message: CONTEXT_EMPTY_MESSAGE });
  });

  it("permite cambiar de SportSpace si existe Membership", async () => {
    const client = fakeClient([owner, coach], {});
    const result = await resolveMcpApplicationContext(
      toolCtx({ claims: { sportSpaceId: "space-b" } }),
      runtimeFor(client),
    );
    expect(result.ok && result.context.sportSpaceId).toBe("space-b");
  });

  it("bloquea el acceso cruzado a un SportSpace ajeno", async () => {
    const client = fakeClient([owner], {});
    const result = await resolveMcpApplicationContext(
      toolCtx({ claims: { sportSpaceId: "space-x" } }),
      runtimeFor(client),
    );
    expect(result).toMatchObject({ ok: false, reason: "forbidden", message: CONTEXT_FORBIDDEN_MESSAGE });
  });

  it("prioriza el rol Owner al resolver el contexto por defecto", async () => {
    const client = fakeClient([coach, owner], {});
    const result = await resolveMcpApplicationContext(toolCtx(), runtimeFor(client));
    expect(result.ok && result.context.sportSpaceId).toBe("space-a");
  });
});

describe("contextualTool", () => {
  it("ejecuta el Application Service compartido y registra el éxito", async () => {
    const client = fakeClient([owner], { __active: [{ id: "s1" }] });
    const log: ToolExecutionEntry[] = [];
    const handler = contextualTool("list_seasons", (_i, ctx) => listSeasonsService(ctx), runtimeFor(client, log));

    const result: any = await handler({}, toolCtx());
    expect(result.isError).toBeUndefined();
    expect(log[0]).toMatchObject({
      channel: "mcp",
      tool: "list_seasons",
      userId: "user-1",
      sportSpaceId: "space-a",
      outcome: "success",
    });
  });

  it("no ejecuta el servicio sin contexto y registra el error", async () => {
    const client = fakeClient([], {});
    const log: ToolExecutionEntry[] = [];
    let ran = false;
    const handler = contextualTool("list_seasons", async () => { ran = true; }, runtimeFor(client, log));

    const result: any = await handler({}, toolCtx());
    expect(ran).toBe(false);
    expect(result.isError).toBe(true);
    expect(log[0]).toMatchObject({ outcome: "error", error: "empty", sportSpaceId: null });
  });

  it("escribe siempre con el sport_space_id del contexto, nunca desde owner_id", async () => {
    const client = fakeClient([coach], {});
    const handler = contextualTool<{ name: string }>(
      "create_season",
      async (input, ctx) => {
        const { createSeasonService } = await import("@/lib/services/config.service");
        return createSeasonService(ctx, input);
      },
      runtimeFor(client),
    );

    await handler({ name: "2026/2027" }, toolCtx());
    const insert = client.calls.find((c) => c.table === "seasons" && c.payload) as any;
    expect(insert.payload.sport_space_id).toBe("space-b");
    expect(insert.payload.owner_id).toBe("user-1");
  });
});
