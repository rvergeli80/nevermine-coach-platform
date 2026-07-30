/**
 * FEATURE-003.10 — History & Traceability (Nevermine Platform).
 *
 * Modelo de la historia del conocimiento distribuido. Un `HistoryEvent` es un
 * **hecho**: ocurrió, quedó sellado y jamás se modifica. Corregir la historia
 * no consiste en editar un evento, sino en añadir otro.
 *
 * Esta capa no ejecuta operaciones ni altera el comportamiento del Engine:
 * únicamente registra, consulta y reconstruye.
 */

import type { TrustLevel } from "../governance";
import type { LifecycleState } from "../lifecycle";

/** Tipos oficiales de evento del Knowledge Distribution Engine. */
export type HistoryEventType =
  | "CREATE"
  | "PUBLISH"
  | "UNPUBLISH"
  | "INSTALL"
  | "UPDATE"
  | "ROLLBACK"
  | "UNINSTALL"
  | "VERSION_CREATED"
  | "MERGE"
  | "COMPARE"
  | "DISCOVER_UPDATE"
  | "CERTIFICATION_CHANGED"
  | "LIFECYCLE_CHANGED"
  | "TRUST_CHANGED";

export const HISTORY_EVENT_TYPES: readonly HistoryEventType[] = [
  "CREATE",
  "PUBLISH",
  "UNPUBLISH",
  "INSTALL",
  "UPDATE",
  "ROLLBACK",
  "UNINSTALL",
  "VERSION_CREATED",
  "MERGE",
  "COMPARE",
  "DISCOVER_UPDATE",
  "CERTIFICATION_CHANGED",
  "LIFECYCLE_CHANGED",
  "TRUST_CHANGED",
];

export function isHistoryEventType(value: unknown): value is HistoryEventType {
  return typeof value === "string" && (HISTORY_EVENT_TYPES as readonly string[]).includes(value);
}

/** Desde dónde se originó la operación ("desde dónde" del Audit Trail). */
export type HistorySource = "platform" | "web" | "mcp" | "cli" | "system";

export const HISTORY_SOURCES: readonly HistorySource[] = [
  "platform",
  "web",
  "mcp",
  "cli",
  "system",
];

/** Resultado observable de la operación registrada. */
export type HistoryResult = "success" | "failed" | "noop";

/** Datos mínimos y serializables que acompañan al evento. */
export type HistoryDetail = string | number | boolean | null;

/**
 * Hecho histórico append-only. Contiene **sólo** lo necesario para reconstruir
 * la operación: nada de payloads completos ni de estado derivado.
 */
export interface HistoryEvent {
  eventId: string;
  /** ISO 8601. */
  timestamp: string;
  eventType: HistoryEventType;
  packageId: string;
  /** Versión afectada; `null` cuando el evento no es de versión concreta. */
  version: string | null;
  /** Quién ejecutó la operación. */
  actor: string;
  /** Nombre canónico de la operación (p. ej. `installation.update`). */
  operation: string;
  source: HistorySource;
  /** Checksum del contenido implicado, si el hecho lo sella. */
  checksum: string | null;
  /** Correlación entre operaciones de una misma cadena. */
  correlationId: string;
  result: HistoryResult;
  /** Motivo declarado (o del fallo); `null` si la operación no lo aporta. */
  reason: string | null;
  /** Ámbito de instalación (SportSpace en Coach); `null` en eventos globales. */
  scopeId: string | null;
  /** Versión anterior, en operaciones que sustituyen una versión. */
  previousVersion: string | null;
  /** Detalles atómicos necesarios para reconstruir el estado. */
  details: Readonly<Record<string, HistoryDetail>>;
}

/** Entrada de un evento antes de sellarse (id y timestamp pueden derivarse). */
export interface HistoryEventInput {
  eventType: HistoryEventType;
  packageId: string;
  version?: string | null;
  actor?: string | null;
  operation: string;
  source?: HistorySource;
  checksum?: string | null;
  correlationId?: string | null;
  result?: HistoryResult;
  reason?: string | null;
  scopeId?: string | null;
  previousVersion?: string | null;
  timestamp?: string | null;
  details?: Record<string, HistoryDetail>;
}

/** Consulta del Search API. Todos los criterios se combinan con AND. */
export interface HistoryQuery {
  packageId?: string;
  version?: string;
  /** Identificador de fusión (se registra en los eventos MERGE). */
  mergeId?: string;
  actor?: string;
  eventType?: HistoryEventType | readonly HistoryEventType[];
  source?: HistorySource;
  scopeId?: string;
  correlationId?: string;
  /** ISO 8601 inclusivo. */
  from?: string;
  /** ISO 8601 inclusivo. */
  to?: string;
  /** Orden cronológico; por defecto ascendente. */
  order?: "asc" | "desc";
  limit?: number;
}

/** Entrada del Audit Trail: quién, cuándo, desde dónde, resultado y motivo. */
export interface AuditEntry {
  eventId: string;
  who: string;
  when: string;
  where: HistorySource;
  what: HistoryEventType;
  operation: string;
  packageId: string;
  version: string | null;
  scopeId: string | null;
  result: HistoryResult;
  reason: string | null;
  correlationId: string;
  /** Otros eventos de la misma correlación, en orden cronológico. */
  relatedEventIds: readonly string[];
}

/** Entrada de la línea temporal. */
export interface TimelineEntry {
  eventId: string;
  timestamp: string;
  eventType: HistoryEventType;
  packageId: string;
  version: string | null;
  actor: string;
  source: HistorySource;
  result: HistoryResult;
  summary: string;
  correlationId: string;
}

/** Estado reconstruido de una configuración en un instante dado. */
export interface ReconstructedState {
  packageId: string;
  /** Instante al que corresponde la reconstrucción (ISO 8601). */
  at: string;
  /** ¿Existía el paquete en ese momento? */
  exists: boolean;
  /** Última versión conocida del paquete en ese instante. */
  latestVersion: string | null;
  /** Versiones creadas hasta ese instante, en orden de aparición. */
  versions: readonly string[];
  lifecycleState: LifecycleState | null;
  trustLevel: TrustLevel | null;
  certified: boolean;
  /** Versiones con publicación vigente en ese instante. */
  publishedVersions: readonly string[];
  /** Instalaciones vigentes por ámbito: `scopeId -> versión instalada`. */
  installations: Readonly<Record<string, string>>;
  /** Fusiones registradas hasta ese instante. */
  merges: readonly string[];
  /** Nº de eventos aplicados en la reconstrucción. */
  appliedEvents: number;
  lastEventId: string | null;
  checksum: string | null;
}

/** Informe de trazabilidad reutilizable por UI, MCP y CLI. */
export interface TraceabilityReport {
  packageId: string;
  generatedAt: string;
  totalEvents: number;
  firstEventAt: string | null;
  lastEventAt: string | null;
  actors: readonly string[];
  eventCounts: Readonly<Record<HistoryEventType, number>>;
  versions: readonly string[];
  publications: readonly TimelineEntry[];
  installations: readonly TimelineEntry[];
  rollbacks: readonly TimelineEntry[];
  merges: readonly TimelineEntry[];
  lifecycleChanges: readonly TimelineEntry[];
  trustChanges: readonly TimelineEntry[];
  timeline: readonly TimelineEntry[];
  auditTrail: readonly AuditEntry[];
  currentState: ReconstructedState;
}
