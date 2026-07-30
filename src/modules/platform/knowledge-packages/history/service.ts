/**
 * FEATURE-003.10 — History Service (Nevermine Platform).
 *
 * **Única puerta de acceso** al historial del Knowledge Distribution Engine.
 * Ni Coach ni MCP ni CLI tocan el almacén: preguntan aquí.
 *
 * Alcance estricto: registrar, consultar y reconstruir. No publica, no
 * instala, no versiona y no modifica el comportamiento de ningún motor.
 */

import { buildAuditTrail } from "./audit";
import {
  fromInstallationEvents,
  fromLifecycleTransitions,
  fromPublicationAudit,
  fromPublications,
  fromVersionRecords,
} from "./ingest";
import { reconstructState } from "./reconstruct";
import { buildTraceabilityReport } from "./report";
import { searchEvents } from "./search";
import { buildTimeline, summarizeEvent } from "./timeline";
import { HistoryStore, sealEvent } from "./store";
import type {
  AuditEntry,
  HistoryEvent,
  HistoryEventInput,
  HistoryQuery,
  ReconstructedState,
  TimelineEntry,
  TraceabilityReport,
} from "./types";

export interface HistoryServiceOptions {
  store?: HistoryStore;
  now?: () => string;
}

/** Fuentes append-only del resto del Engine que el historial sabe ingerir. */
export interface HistoryIngestionSources {
  lifecycle?: Parameters<typeof fromLifecycleTransitions>[0];
  publicationAudit?: Parameters<typeof fromPublicationAudit>[0];
  publications?: Parameters<typeof fromPublications>[0];
  versions?: Parameters<typeof fromVersionRecords>[0];
  installations?: Parameters<typeof fromInstallationEvents>[0];
  source?: HistoryEventInput["source"];
}

export class HistoryService {
  private readonly store: HistoryStore;
  private readonly now: () => string;

  constructor(options: HistoryServiceOptions = {}) {
    this.store = options.store ?? new HistoryStore();
    this.now = options.now ?? (() => new Date().toISOString());
  }

  // ── Registro (append-only) ────────────────────────────────────────────────

  /** Registra un hecho. Repetirlo no lo duplica: el `eventId` es determinista. */
  record(input: HistoryEventInput): HistoryEvent {
    return this.store.append(sealEvent(input, this.now));
  }

  recordMany(inputs: readonly HistoryEventInput[]): HistoryEvent[] {
    return inputs.map((input) => this.record(input));
  }

  /**
   * Ingiere los registros de los demás motores. Es idempotente: volver a
   * ingerir las mismas fuentes no añade eventos nuevos.
   */
  ingest(sources: HistoryIngestionSources): HistoryEvent[] {
    const source = sources.source ?? "platform";
    const inputs: HistoryEventInput[] = [
      ...fromVersionRecords(sources.versions ?? [], source),
      ...fromLifecycleTransitions(sources.lifecycle ?? [], source),
      ...fromPublicationAudit(sources.publicationAudit ?? [], source),
      ...fromPublications(sources.publications ?? [], source),
      ...fromInstallationEvents(sources.installations ?? [], source),
    ];
    return this.recordMany(inputs);
  }

  // ── Consulta ──────────────────────────────────────────────────────────────

  /** Search API: consulta por paquete, versión, merge, actor, tipo, fecha… */
  getEvents(query: HistoryQuery = {}): HistoryEvent[] {
    return searchEvents(this.store.all(), query);
  }

  /** Historial completo de un paquete, en orden cronológico. */
  getHistory(packageId: string, query: Omit<HistoryQuery, "packageId"> = {}): HistoryEvent[] {
    return this.getEvents({ ...query, packageId });
  }

  /** Línea temporal consultable cronológicamente o por cualquier criterio. */
  getTimeline(query: HistoryQuery = {}): TimelineEntry[] {
    return buildTimeline(this.store.all(), query);
  }

  /** Audit Trail determinista: quién, cuándo, dónde, resultado, motivo. */
  getAuditTrail(query: HistoryQuery = {}): AuditEntry[] {
    return buildAuditTrail(this.store.all(), query);
  }

  /** Estado exacto de una configuración en un instante, deducido de sus eventos. */
  reconstructState(packageId: string, timestamp?: string): ReconstructedState {
    return reconstructState(this.store.all(), packageId, timestamp);
  }

  /** Informe de trazabilidad reutilizable por UI, MCP y CLI. */
  getTraceabilityReport(packageId: string, at?: string): TraceabilityReport {
    return buildTraceabilityReport(this.store.all(), packageId, { at, now: this.now });
  }

  /** Narración en lenguaje humano del historial de un paquete. */
  explainHistory(packageId: string): string[] {
    return this.getHistory(packageId).map(
      (event) => `${event.timestamp} — ${summarizeEvent(event)} (${event.actor}, ${event.source})`,
    );
  }

  get size(): number {
    return this.store.size;
  }
}

export function createHistoryService(options: HistoryServiceOptions = {}): HistoryService {
  return new HistoryService(options);
}
