import { describe, expect, it } from "vitest";

import { createCoachHistoryService, fromCoachInstallationRows, historyPackageIds } from "./history";

const rows = [
  {
    id: "e1",
    pack_id: "waterpolo-basics",
    action: "install",
    status: "installed",
    from_version: null,
    to_version: "1.0.0",
    created_at: "2026-02-01T10:00:00.000Z",
    actor_id: "coach-1",
    message: null,
  },
  {
    id: "e2",
    pack_id: "waterpolo-basics",
    action: "update",
    status: "installed",
    from_version: "1.0.0",
    to_version: "1.1.0",
    created_at: "2026-02-02T10:00:00.000Z",
    actor_id: "coach-1",
    message: null,
  },
  {
    id: "e3",
    pack_id: "waterpolo-basics",
    action: "rollback",
    status: "installed",
    from_version: "1.1.0",
    to_version: "1.0.0",
    created_at: "2026-02-03T10:00:00.000Z",
    actor_id: "coach-1",
    message: "Revertido por el entrenador",
  },
];

describe("FEATURE-003.10 — Integración Coach", () => {
  it("traduce los eventos persistidos a hechos históricos", () => {
    const events = fromCoachInstallationRows(rows, "space-1");
    expect(events.map((e) => e.eventType)).toEqual(["INSTALL", "UPDATE", "ROLLBACK"]);
    expect(events.every((e) => e.scopeId === "space-1")).toBe(true);
  });

  it("descarta acciones desconocidas en vez de inventar historia", () => {
    expect(fromCoachInstallationRows([{ ...rows[0], action: "sync" }], "space-1")).toHaveLength(0);
  });

  it("expone el historial del catálogo oficial sin ámbito", () => {
    const history = createCoachHistoryService();
    const packId = historyPackageIds()[0];
    expect(history.getHistory(packId).length).toBeGreaterThan(0);
    expect(history.getEvents({ eventType: "INSTALL" })).toHaveLength(0);
  });

  it("reconstruye el estado del ámbito a partir de sus eventos", () => {
    const history = createCoachHistoryService({ scopeId: "space-1", installationEvents: rows });
    const state = history.reconstructState("waterpolo-basics");
    expect(state.installations["space-1"]).toBe("1.0.0");
    expect(
      history.reconstructState("waterpolo-basics", "2026-02-02T23:00:00.000Z").installations,
    ).toEqual({ "space-1": "1.1.0" });
  });

  it("aísla la historia entre SportSpaces", () => {
    const other = createCoachHistoryService({ scopeId: "space-2", installationEvents: [] });
    expect(other.getEvents({ scopeId: "space-1" })).toHaveLength(0);
  });

  it("no duplica hechos al construir el servicio dos veces", () => {
    const a = createCoachHistoryService({ scopeId: "space-1", installationEvents: rows });
    const b = createCoachHistoryService({ scopeId: "space-1", installationEvents: rows });
    expect(a.size).toBe(b.size);
    expect(a.getAuditTrail()).toEqual(b.getAuditTrail());
  });

  it("produce un informe de trazabilidad completo del pack instalado", () => {
    const history = createCoachHistoryService({ scopeId: "space-1", installationEvents: rows });
    const report = history.getTraceabilityReport("waterpolo-basics");
    expect(report.installations.length).toBeGreaterThan(0);
    expect(report.rollbacks).toHaveLength(1);
    expect(report.timeline.length).toBe(report.totalEvents);
    expect(history.explainHistory("waterpolo-basics").length).toBe(report.totalEvents);
  });
});
