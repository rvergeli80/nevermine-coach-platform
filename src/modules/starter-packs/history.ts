/**
 * FEATURE-003.10 — Adaptador Coach del History Engine.
 *
 * Coach **no** guarda historia por su cuenta ni lee el almacén: construye un
 * `HistoryService` de la plataforma alimentado con los registros append-only
 * que ya existen (ciclo de vida, gobierno de publicación, distribución,
 * linaje de versiones) y con los eventos de instalación del ámbito activo.
 *
 * El servicio se construye por consulta y con el ámbito recibido: la historia
 * de un SportSpace nunca se mezcla con la de otro.
 */

import {
  createHistoryService,
  type HistoryEventInput,
  type HistoryService,
} from "../platform/knowledge-packages";
import { coachPublicationRegistry } from "./distribution";
import {
  knowledgePackages,
  starterPackLifecycleHistory,
  starterPackPublicationAudit,
  starterPacks,
} from "./repository";
import { configurationHistory } from "./versioning";

/** Evento de instalación tal y como lo persiste Coach en base de datos. */
export interface CoachInstallationEventRow {
  id: string;
  pack_id: string;
  action: string;
  status: string;
  from_version: string | null;
  to_version: string;
  created_at: string;
  actor_id?: string | null;
  message?: string | null;
}

const ACTIONS: Record<string, HistoryEventInput["eventType"]> = {
  install: "INSTALL",
  reinstall: "INSTALL",
  update: "UPDATE",
  rollback: "ROLLBACK",
  uninstall: "UNINSTALL",
};

/** Traduce los eventos persistidos de Coach a hechos históricos. */
export function fromCoachInstallationRows(
  rows: readonly CoachInstallationEventRow[],
  scopeId: string,
): HistoryEventInput[] {
  return rows
    .filter((row) => ACTIONS[row.action])
    .map((row) => ({
      eventType: ACTIONS[row.action],
      packageId: row.pack_id,
      version: row.to_version,
      previousVersion: row.from_version,
      actor: row.actor_id ?? "system",
      operation: `coach.starter-pack.${row.action}`,
      source: "web" as const,
      timestamp: row.created_at,
      result: row.status === "failed" ? ("failed" as const) : ("success" as const),
      reason: row.message ?? null,
      scopeId,
      details: { action: row.action, status: row.status, eventRowId: row.id },
    }));
}

/**
 * Historial del catálogo oficial (sin ámbito): versiones, ciclo de vida,
 * gobierno y distribución. Es el mismo para todos los SportSpaces.
 */
export function catalogHistorySources() {
  const versions = starterPacks.flatMap((pack) => configurationHistory(pack.id));
  return {
    versions,
    lifecycle: starterPackLifecycleHistory(),
    publicationAudit: starterPackPublicationAudit(),
    publications: coachPublicationRegistry.all(),
  };
}

/**
 * Construye el History Service del ámbito indicado. Idempotente: ingerir dos
 * veces las mismas fuentes no duplica hechos (los `eventId` son deterministas).
 */
export function createCoachHistoryService(options: {
  scopeId?: string | null;
  installationEvents?: readonly CoachInstallationEventRow[];
} = {}): HistoryService {
  const history = createHistoryService();
  history.ingest({ ...catalogHistorySources(), source: "platform" });
  if (options.scopeId && options.installationEvents?.length) {
    history.recordMany(fromCoachInstallationRows(options.installationEvents, options.scopeId));
  }
  return history;
}

/** Paquetes de los que Coach puede narrar historia (catálogo oficial). */
export function historyPackageIds(): string[] {
  return knowledgePackages.list().map((pkg) => pkg.id);
}
