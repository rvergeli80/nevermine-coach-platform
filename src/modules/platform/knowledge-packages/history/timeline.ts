/**
 * FEATURE-003.10 — Timeline.
 *
 * Proyección legible del historial. No añade información: resume cada hecho
 * en una línea para que UI, MCP y CLI muestren lo mismo.
 */

import { searchEvents } from "./search";
import type { HistoryEvent, HistoryQuery, TimelineEntry } from "./types";

const VERBS: Record<HistoryEvent["eventType"], string> = {
  CREATE: "Se registró el paquete",
  PUBLISH: "Se publicó",
  UNPUBLISH: "Se retiró la publicación de",
  INSTALL: "Se instaló",
  UPDATE: "Se actualizó a",
  ROLLBACK: "Se revirtió a",
  UNINSTALL: "Se desinstaló",
  VERSION_CREATED: "Se creó la versión",
  MERGE: "Se fusionó en",
  COMPARE: "Se comparó",
  DISCOVER_UPDATE: "Se anunció la actualización",
  CERTIFICATION_CHANGED: "Cambió la certificación de",
  LIFECYCLE_CHANGED: "Cambió el ciclo de vida de",
  TRUST_CHANGED: "Cambió el nivel de confianza de",
};

export function summarizeEvent(event: HistoryEvent): string {
  const target = event.version ? `${event.packageId}@${event.version}` : event.packageId;
  const from = event.previousVersion ? ` (desde ${event.previousVersion})` : "";
  const outcome =
    event.result === "success" ? "" : event.result === "noop" ? " — sin cambios" : " — con error";
  return `${VERBS[event.eventType]} ${target}${from}${outcome}`;
}

export function toTimelineEntry(event: HistoryEvent): TimelineEntry {
  return {
    eventId: event.eventId,
    timestamp: event.timestamp,
    eventType: event.eventType,
    packageId: event.packageId,
    version: event.version,
    actor: event.actor,
    source: event.source,
    result: event.result,
    summary: summarizeEvent(event),
    correlationId: event.correlationId,
  };
}

/**
 * Línea temporal completa. Los filtros del Search API (paquete, versión,
 * actor, tipo, fechas) se aplican tal cual: la timeline es una vista.
 */
export function buildTimeline(
  events: readonly HistoryEvent[],
  query: HistoryQuery = {},
): TimelineEntry[] {
  return searchEvents(events, query).map(toTimelineEntry);
}
