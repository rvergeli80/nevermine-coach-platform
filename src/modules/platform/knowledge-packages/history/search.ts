/**
 * FEATURE-003.10 — Search API.
 *
 * Consulta determinista sobre el historial: los mismos eventos y la misma
 * consulta devuelven siempre el mismo resultado, en el mismo orden.
 */

import type { HistoryEvent, HistoryQuery } from "./types";

function matchesType(event: HistoryEvent, query: HistoryQuery): boolean {
  if (!query.eventType) return true;
  return Array.isArray(query.eventType)
    ? query.eventType.includes(event.eventType)
    : event.eventType === query.eventType;
}

/** El `mergeId` viaja en los detalles del evento MERGE y de la versión fusionada. */
function matchesMerge(event: HistoryEvent, mergeId?: string): boolean {
  if (!mergeId) return true;
  return event.details.mergeId === mergeId;
}

/** Orden total y estable: por instante y, a igualdad, por identificador. */
export function compareEvents(a: HistoryEvent, b: HistoryEvent): number {
  if (a.timestamp !== b.timestamp) return a.timestamp < b.timestamp ? -1 : 1;
  return a.eventId.localeCompare(b.eventId);
}

export function searchEvents(
  events: readonly HistoryEvent[],
  query: HistoryQuery = {},
): HistoryEvent[] {
  const filtered = events.filter(
    (event) =>
      (!query.packageId || event.packageId === query.packageId) &&
      (!query.version || event.version === query.version) &&
      (!query.actor || event.actor === query.actor) &&
      (!query.source || event.source === query.source) &&
      (!query.scopeId || event.scopeId === query.scopeId) &&
      (!query.correlationId || event.correlationId === query.correlationId) &&
      (!query.from || event.timestamp >= query.from) &&
      (!query.to || event.timestamp <= query.to) &&
      matchesType(event, query) &&
      matchesMerge(event, query.mergeId),
  );

  filtered.sort(compareEvents);
  if (query.order === "desc") filtered.reverse();
  return typeof query.limit === "number" && query.limit >= 0
    ? filtered.slice(0, query.limit)
    : filtered;
}
