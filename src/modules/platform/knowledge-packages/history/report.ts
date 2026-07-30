/**
 * FEATURE-003.10 — Traceability Report.
 *
 * Informe único y reutilizable por UI, MCP y CLI. Se genera a partir del
 * historial: no consulta el repositorio ni el estado vivo del Engine.
 */

import { buildAuditTrail } from "./audit";
import { reconstructState } from "./reconstruct";
import { searchEvents } from "./search";
import { buildTimeline, toTimelineEntry } from "./timeline";
import {
  HISTORY_EVENT_TYPES,
  type HistoryEvent,
  type HistoryEventType,
  type TimelineEntry,
  type TraceabilityReport,
} from "./types";

function countByType(events: readonly HistoryEvent[]): Record<HistoryEventType, number> {
  const counts = Object.fromEntries(HISTORY_EVENT_TYPES.map((t) => [t, 0])) as Record<
    HistoryEventType,
    number
  >;
  for (const event of events) counts[event.eventType] += 1;
  return counts;
}

const pick = (
  events: readonly HistoryEvent[],
  types: readonly HistoryEventType[],
): TimelineEntry[] => events.filter((e) => types.includes(e.eventType)).map(toTimelineEntry);

export function buildTraceabilityReport(
  events: readonly HistoryEvent[],
  packageId: string,
  options: { at?: string; now?: () => string } = {},
): TraceabilityReport {
  const now = options.now ?? (() => new Date().toISOString());
  const scoped = searchEvents(events, { packageId, to: options.at });

  const versions: string[] = [];
  for (const event of scoped) {
    if (event.version && !versions.includes(event.version)) versions.push(event.version);
  }

  return {
    packageId,
    generatedAt: now(),
    totalEvents: scoped.length,
    firstEventAt: scoped[0]?.timestamp ?? null,
    lastEventAt: scoped[scoped.length - 1]?.timestamp ?? null,
    actors: [...new Set(scoped.map((e) => e.actor))].sort(),
    eventCounts: countByType(scoped),
    versions,
    publications: pick(scoped, ["PUBLISH", "UNPUBLISH"]),
    installations: pick(scoped, ["INSTALL", "UPDATE", "UNINSTALL"]),
    rollbacks: pick(scoped, ["ROLLBACK"]),
    merges: pick(scoped, ["MERGE"]),
    lifecycleChanges: pick(scoped, ["LIFECYCLE_CHANGED", "CERTIFICATION_CHANGED"]),
    trustChanges: pick(scoped, ["TRUST_CHANGED"]),
    timeline: buildTimeline(scoped),
    auditTrail: buildAuditTrail(scoped),
    currentState: reconstructState(scoped, packageId, options.at),
  };
}
