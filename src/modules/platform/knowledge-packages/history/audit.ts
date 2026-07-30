/**
 * FEATURE-003.10 — Audit Trail.
 *
 * Cada operación responde a seis preguntas: quién, cuándo, desde dónde, con
 * qué resultado, por qué motivo y con qué otras operaciones se correlaciona.
 * La construcción es determinista: mismos eventos ⇒ misma auditoría.
 */

import { searchEvents } from "./search";
import type { AuditEntry, HistoryEvent, HistoryQuery } from "./types";

export function buildAuditTrail(
  events: readonly HistoryEvent[],
  query: HistoryQuery = {},
): AuditEntry[] {
  // La correlación se calcula sobre el historial completo: filtrar la vista no
  // puede romper el vínculo entre operaciones de una misma cadena.
  const byCorrelation = new Map<string, string[]>();
  for (const event of searchEvents(events)) {
    const bucket = byCorrelation.get(event.correlationId) ?? [];
    bucket.push(event.eventId);
    byCorrelation.set(event.correlationId, bucket);
  }

  return searchEvents(events, query).map((event) => ({
    eventId: event.eventId,
    who: event.actor,
    when: event.timestamp,
    where: event.source,
    what: event.eventType,
    operation: event.operation,
    packageId: event.packageId,
    version: event.version,
    scopeId: event.scopeId,
    result: event.result,
    reason: event.reason,
    correlationId: event.correlationId,
    relatedEventIds: (byCorrelation.get(event.correlationId) ?? []).filter(
      (id) => id !== event.eventId,
    ),
  }));
}
