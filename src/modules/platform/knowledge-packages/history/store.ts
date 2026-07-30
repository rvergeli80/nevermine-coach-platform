/**
 * FEATURE-003.10 — Almacén append-only de eventos históricos.
 *
 * El almacén sólo admite **añadir**. No expone actualización ni borrado, y los
 * eventos se congelan al entrar: cualquier intento de mutación es un error del
 * llamante, no una operación soportada.
 */

import { checksumOf } from "../integrity";
import type { HistoryEvent, HistoryEventInput } from "./types";

/** Identificador determinista: mismo hecho ⇒ mismo `eventId`. */
export function deriveEventId(event: Omit<HistoryEvent, "eventId">): string {
  return `evt_${checksumOf({
    t: event.timestamp,
    e: event.eventType,
    p: event.packageId,
    v: event.version,
    a: event.actor,
    o: event.operation,
    s: event.source,
    c: event.correlationId,
    r: event.result,
    sc: event.scopeId,
    pv: event.previousVersion,
    d: event.details,
  })}`;
}

/** Sella una entrada convirtiéndola en un hecho inmutable. */
export function sealEvent(input: HistoryEventInput, now: () => string): HistoryEvent {
  const timestamp = input.timestamp?.trim() || now();
  const packageId = input.packageId?.trim();
  if (!packageId) throw new Error("Un evento histórico debe indicar el paquete al que pertenece.");
  if (!input.operation?.trim()) throw new Error("Un evento histórico debe nombrar su operación.");

  const base: Omit<HistoryEvent, "eventId"> = {
    timestamp,
    eventType: input.eventType,
    packageId,
    version: input.version?.trim() || null,
    actor: input.actor?.trim() || "system",
    operation: input.operation.trim(),
    source: input.source ?? "platform",
    checksum: input.checksum?.trim() || null,
    // Sin correlación explícita, el hecho se correlaciona consigo mismo.
    correlationId: input.correlationId?.trim() || "",
    result: input.result ?? "success",
    reason: input.reason?.trim() || null,
    scopeId: input.scopeId?.trim() || null,
    previousVersion: input.previousVersion?.trim() || null,
    details: Object.freeze({ ...(input.details ?? {}) }),
  };

  const eventId = deriveEventId(base);
  return Object.freeze({
    ...base,
    correlationId: base.correlationId || eventId,
    eventId,
  });
}

export class HistoryStore {
  private readonly events: HistoryEvent[] = [];
  private readonly index = new Set<string>();

  /** Añade un hecho. Repetir el mismo hecho no lo duplica (idempotencia). */
  append(event: HistoryEvent): HistoryEvent {
    if (this.index.has(event.eventId)) {
      return this.events.find((e) => e.eventId === event.eventId)!;
    }
    this.index.add(event.eventId);
    this.events.push(event);
    return event;
  }

  has(eventId: string): boolean {
    return this.index.has(eventId);
  }

  get(eventId: string): HistoryEvent | undefined {
    return this.events.find((e) => e.eventId === eventId);
  }

  /** Todos los eventos en orden de registro. */
  all(): readonly HistoryEvent[] {
    return [...this.events];
  }

  get size(): number {
    return this.events.length;
  }
}
