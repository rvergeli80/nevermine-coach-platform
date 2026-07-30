import { describe, expect, it } from "vitest";

import { createHistoryService } from "./service";
import { HistoryStore, sealEvent } from "./store";
import type { HistoryEventInput } from "./types";

const now = () => "2026-01-01T00:00:00.000Z";

const event = (input: Partial<HistoryEventInput> & Pick<HistoryEventInput, "eventType">) =>
  ({
    packageId: "waterpolo",
    operation: "test.operation",
    actor: "coach@nevermine.dev",
    ...input,
  }) as HistoryEventInput;

describe("FEATURE-003.10 — Event Model", () => {
  it("sella el evento con identificador determinista", () => {
    const a = sealEvent(event({ eventType: "CREATE", version: "1.0.0", timestamp: now() }), now);
    const b = sealEvent(event({ eventType: "CREATE", version: "1.0.0", timestamp: now() }), now);
    expect(a.eventId).toBe(b.eventId);
    expect(a.eventId).toMatch(/^evt_/);
  });

  it("es append-only: el evento no puede modificarse", () => {
    const sealed = sealEvent(event({ eventType: "CREATE", version: "1.0.0" }), now);
    expect(() => {
      (sealed as { actor: string }).actor = "otro";
    }).toThrow();
  });

  it("no duplica el mismo hecho registrado dos veces", () => {
    const store = new HistoryStore();
    const sealed = sealEvent(event({ eventType: "PUBLISH", version: "1.0.0", timestamp: now() }), now);
    store.append(sealed);
    store.append(sealed);
    expect(store.size).toBe(1);
  });

  it("correlaciona el evento consigo mismo si no se aporta correlación", () => {
    const sealed = sealEvent(event({ eventType: "INSTALL", version: "1.0.0" }), now);
    expect(sealed.correlationId).toBe(sealed.eventId);
  });

  it("exige paquete y operación", () => {
    expect(() => sealEvent(event({ eventType: "CREATE", packageId: "  " }), now)).toThrow();
    expect(() => sealEvent(event({ eventType: "CREATE", operation: "" }), now)).toThrow();
  });
});

function seeded() {
  const history = createHistoryService({ now });
  history.recordMany([
    event({ eventType: "CREATE", version: "1.0.0", timestamp: "2026-01-01T10:00:00.000Z" }),
    event({
      eventType: "LIFECYCLE_CHANGED",
      version: "1.0.0",
      timestamp: "2026-01-01T11:00:00.000Z",
      operation: "lifecycle.transition",
      details: { from: "draft", to: "certified" },
    }),
    event({
      eventType: "CERTIFICATION_CHANGED",
      version: "1.0.0",
      timestamp: "2026-01-01T11:00:01.000Z",
      operation: "lifecycle.certify",
      details: { certified: true },
    }),
    event({
      eventType: "PUBLISH",
      version: "1.0.0",
      timestamp: "2026-01-01T12:00:00.000Z",
      operation: "distribution.publish",
      correlationId: "corr-publish",
    }),
    event({
      eventType: "INSTALL",
      version: "1.0.0",
      timestamp: "2026-01-02T09:00:00.000Z",
      operation: "installation.install",
      scopeId: "space-1",
      actor: "ana",
      source: "web",
      correlationId: "corr-publish",
    }),
    event({
      eventType: "VERSION_CREATED",
      version: "1.1.0",
      timestamp: "2026-01-03T09:00:00.000Z",
      operation: "versioning.version",
    }),
    event({
      eventType: "MERGE",
      version: "1.2.0",
      timestamp: "2026-01-04T09:00:00.000Z",
      operation: "merge.apply",
      details: { mergeId: "merge-7" },
    }),
    event({
      eventType: "UPDATE",
      version: "1.1.0",
      previousVersion: "1.0.0",
      timestamp: "2026-01-05T09:00:00.000Z",
      operation: "installation.update",
      scopeId: "space-1",
      actor: "ana",
      source: "web",
    }),
    event({
      eventType: "ROLLBACK",
      version: "1.0.0",
      previousVersion: "1.1.0",
      timestamp: "2026-01-06T09:00:00.000Z",
      operation: "installation.rollback",
      scopeId: "space-1",
      actor: "ana",
      source: "web",
    }),
    event({
      eventType: "TRUST_CHANGED",
      version: "1.0.0",
      timestamp: "2026-01-07T09:00:00.000Z",
      operation: "governance.trust",
      details: { from: "community", to: "official" },
    }),
    event({
      eventType: "INSTALL",
      version: "1.0.0",
      timestamp: "2026-01-08T09:00:00.000Z",
      operation: "installation.install",
      scopeId: "space-2",
      result: "failed",
      reason: "Checksum inválido",
    }),
  ]);
  return history;
}

describe("FEATURE-003.10 — Search API", () => {
  const history = seeded();

  it("consulta por paquete y devuelve orden cronológico estable", () => {
    const events = history.getHistory("waterpolo");
    const timestamps = events.map((e) => e.timestamp);
    expect([...timestamps].sort()).toEqual(timestamps);
  });

  it("consulta por versión, actor, tipo, fecha, mergeId y correlación", () => {
    expect(history.getEvents({ version: "1.1.0" })).toHaveLength(2);
    expect(history.getEvents({ actor: "ana" })).toHaveLength(3);
    expect(history.getEvents({ eventType: "PUBLISH" })).toHaveLength(1);
    expect(history.getEvents({ from: "2026-01-05T00:00:00.000Z" })).toHaveLength(4);
    expect(history.getEvents({ mergeId: "merge-7" })).toHaveLength(1);
    expect(history.getEvents({ correlationId: "corr-publish" })).toHaveLength(2);
    expect(history.getEvents({ scopeId: "space-2" })).toHaveLength(1);
  });

  it("admite orden descendente y límite", () => {
    const events = history.getEvents({ order: "desc", limit: 2 });
    expect(events).toHaveLength(2);
    expect(events[0].timestamp > events[1].timestamp).toBe(true);
  });
});

describe("FEATURE-003.10 — Timeline y Audit Trail", () => {
  const history = seeded();

  it("proyecta la línea temporal completa con resumen legible", () => {
    const timeline = history.getTimeline({ packageId: "waterpolo" });
    expect(timeline).toHaveLength(history.getHistory("waterpolo").length);
    expect(timeline[0].summary).toContain("waterpolo@1.0.0");
  });

  it("filtra la timeline por actor y por tipo de evento", () => {
    expect(history.getTimeline({ actor: "ana" })).toHaveLength(3);
    expect(history.getTimeline({ eventType: ["INSTALL", "UPDATE"] })).toHaveLength(3);
  });

  it("responde quién, cuándo, desde dónde, resultado y motivo", () => {
    const failed = history.getAuditTrail({ scopeId: "space-2" })[0];
    expect(failed.who).toBe("coach@nevermine.dev");
    expect(failed.where).toBe("platform");
    expect(failed.result).toBe("failed");
    expect(failed.reason).toBe("Checksum inválido");
  });

  it("correlaciona operaciones de una misma cadena", () => {
    const trail = history.getAuditTrail({ correlationId: "corr-publish" });
    expect(trail).toHaveLength(2);
    expect(trail[0].relatedEventIds).toContain(trail[1].eventId);
  });

  it("es determinista", () => {
    expect(seeded().getAuditTrail()).toEqual(seeded().getAuditTrail());
  });
});

describe("FEATURE-003.10 — State Reconstruction", () => {
  const history = seeded();

  it("reconstruye el estado en un instante intermedio", () => {
    const state = history.reconstructState("waterpolo", "2026-01-02T23:59:59.000Z");
    expect(state.exists).toBe(true);
    expect(state.versions).toEqual(["1.0.0"]);
    expect(state.publishedVersions).toEqual(["1.0.0"]);
    expect(state.installations).toEqual({ "space-1": "1.0.0" });
    expect(state.certified).toBe(true);
    expect(state.lifecycleState).toBe("certified");
    expect(state.trustLevel).toBeNull();
  });

  it("refleja actualización y rollback en el ámbito instalado", () => {
    expect(
      history.reconstructState("waterpolo", "2026-01-05T12:00:00.000Z").installations,
    ).toEqual({ "space-1": "1.1.0" });
    expect(history.reconstructState("waterpolo").installations).toEqual({ "space-1": "1.0.0" });
  });

  it("ignora los eventos fallidos al deducir el estado", () => {
    expect(history.reconstructState("waterpolo").installations["space-2"]).toBeUndefined();
  });

  it("devuelve estado vacío para un paquete sin historia", () => {
    const state = history.reconstructState("inexistente");
    expect(state.exists).toBe(false);
    expect(state.appliedEvents).toBe(0);
  });

  it("aplica el estado final de confianza y fusiones", () => {
    const state = history.reconstructState("waterpolo");
    expect(state.trustLevel).toBe("official");
    expect(state.merges).toEqual(["merge-7"]);
    expect(state.latestVersion).toBe("1.2.0");
  });
});

describe("FEATURE-003.10 — Traceability Report", () => {
  const history = seeded();
  const report = history.getTraceabilityReport("waterpolo");

  it("agrega historial, versiones y operaciones", () => {
    expect(report.totalEvents).toBe(history.getHistory("waterpolo").length);
    expect(report.versions).toEqual(["1.0.0", "1.1.0", "1.2.0"]);
    expect(report.publications).toHaveLength(1);
    expect(report.installations).toHaveLength(3);
    expect(report.rollbacks).toHaveLength(1);
    expect(report.merges).toHaveLength(1);
    expect(report.trustChanges).toHaveLength(1);
    expect(report.lifecycleChanges).toHaveLength(2);
  });

  it("incluye timeline, auditoría y estado reconstruido", () => {
    expect(report.timeline.length).toBe(report.totalEvents);
    expect(report.auditTrail.length).toBe(report.totalEvents);
    expect(report.currentState.packageId).toBe("waterpolo");
  });

  it("narra el historial en lenguaje humano", () => {
    const lines = history.explainHistory("waterpolo");
    expect(lines).toHaveLength(report.totalEvents);
    expect(lines[0]).toContain("Se registró el paquete");
  });
});

describe("FEATURE-003.10 — Ingesta desde el resto del Engine", () => {
  it("traduce transiciones, publicaciones, versiones e instalaciones", () => {
    const history = createHistoryService({ now });
    history.ingest({
      versions: [
        {
          versionId: "v1",
          packageId: "waterpolo",
          semanticVersion: "1.0.0",
          parentVersionId: null,
          createdAt: "2026-01-01T10:00:00.000Z",
          createdBy: "nevermine",
          changeType: "initial",
          changeSummary: "Alta",
          reason: "Catálogo oficial",
          adr: null,
          issue: null,
          checksum: "abc",
          publicationState: "published",
          lifecycleState: "published",
          trustLevel: "official",
          merge: null,
        },
      ],
      lifecycle: [
        {
          packageId: "waterpolo",
          version: "1.0.0",
          from: "draft",
          to: "certified",
          actor: "nevermine",
          reason: null,
          at: "2026-01-01T11:00:00.000Z",
          checksum: "abc",
          evidence: null,
        },
      ],
      installations: [
        {
          at: "2026-01-02T10:00:00.000Z",
          action: "INSTALL",
          packageId: "waterpolo",
          version: "1.0.0",
          previousVersion: null,
          scopeId: "space-1",
          actor: "ana",
          result: "success",
          installationId: "inst-1",
          checksum: "abc",
          message: null,
          rolledBack: false,
        },
      ],
    });

    expect(history.getEvents({ eventType: "CREATE" })).toHaveLength(1);
    expect(history.getEvents({ eventType: "CERTIFICATION_CHANGED" })).toHaveLength(1);
    expect(history.getEvents({ eventType: "INSTALL" })).toHaveLength(1);
    const size = history.size;
    // Idempotencia: reingerir las mismas fuentes no crea historia nueva.
    history.ingest({ installations: [] });
    expect(history.size).toBe(size);
  });
});
