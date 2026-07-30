/**
 * FEATURE-003.10 — Ingesta de hechos desde el resto del Engine.
 *
 * El History Engine **no cambia el comportamiento** de los demás motores: lee
 * sus registros append-only (ciclo de vida, auditoría de publicación, registro
 * de distribución, linaje de versiones e historial de instalación) y los
 * traduce a hechos históricos. La traducción es determinista: el mismo estado
 * de origen produce siempre los mismos eventos, con los mismos identificadores.
 */

import type { LifecycleTransition } from "../lifecycle";
import type { PublicationAuditEntry } from "../publication";
import type { InstallationEvent } from "../installation/history";
import type { PublicationEntry } from "../distribution/types";
import type { VersionRecord } from "../versioning/types";
import type { HistoryEventInput, HistorySource } from "./types";

/** Transiciones de ciclo de vida ⇒ LIFECYCLE_CHANGED / CERTIFICATION_CHANGED. */
export function fromLifecycleTransitions(
  transitions: readonly LifecycleTransition[],
  source: HistorySource = "platform",
): HistoryEventInput[] {
  const events: HistoryEventInput[] = [];
  for (const transition of transitions) {
    events.push({
      eventType: "LIFECYCLE_CHANGED",
      packageId: transition.packageId,
      version: transition.version,
      actor: transition.actor,
      operation: "lifecycle.transition",
      source,
      timestamp: transition.at,
      reason: transition.reason ?? null,
      details: { from: transition.from, to: transition.to },
    });
    if (transition.to === "certified") {
      events.push({
        eventType: "CERTIFICATION_CHANGED",
        packageId: transition.packageId,
        version: transition.version,
        actor: transition.actor,
        operation: "lifecycle.certify",
        source,
        timestamp: transition.at,
        reason: transition.reason ?? null,
        details: { certified: true },
      });
    }
  }
  return events;
}

/** Auditoría de gobierno ⇒ PUBLISH / UNPUBLISH / TRUST_CHANGED. */
export function fromPublicationAudit(
  entries: readonly PublicationAuditEntry[],
  source: HistorySource = "platform",
): HistoryEventInput[] {
  return entries.map((entry) => ({
    eventType:
      entry.action === "publish"
        ? ("PUBLISH" as const)
        : entry.action === "publish_rejected"
          ? ("PUBLISH" as const)
          : ("UNPUBLISH" as const),
    packageId: entry.packageId,
    version: entry.version,
    actor: entry.actor,
    operation: `governance.${entry.action}`,
    source,
    timestamp: entry.at,
    checksum: entry.checksum,
    result: entry.action === "publish_rejected" ? ("failed" as const) : ("success" as const),
    reason: entry.reason,
    details: {
      publisherId: entry.publisherId,
      trust: entry.trust ?? null,
      action: entry.action,
    },
  }));
}

/** Registro de distribución ⇒ PUBLISH (y UNPUBLISH si se retiró). */
export function fromPublications(
  publications: readonly PublicationEntry[],
  source: HistorySource = "platform",
): HistoryEventInput[] {
  const events: HistoryEventInput[] = [];
  for (const publication of publications) {
    events.push({
      eventType: "PUBLISH",
      packageId: publication.packageId,
      version: publication.version,
      actor: publication.publishedBy,
      operation: "distribution.publish",
      source,
      timestamp: publication.publishedAt,
      checksum: publication.checksum,
      details: {
        channel: publication.publicationChannel,
        lifecycleState: publication.lifecycleState,
        trust: publication.trustLevel,
      },
    });
    if (!publication.active && publication.revokedAt) {
      events.push({
        eventType: "UNPUBLISH",
        packageId: publication.packageId,
        version: publication.version,
        actor: publication.revokedBy ?? "system",
        operation: "distribution.unpublish",
        source,
        timestamp: publication.revokedAt,
        reason: publication.revokeReason,
        details: { channel: publication.publicationChannel },
      });
    }
  }
  return events;
}

/** Linaje de versiones ⇒ CREATE / VERSION_CREATED / MERGE. */
export function fromVersionRecords(
  versions: readonly (Omit<VersionRecord, "snapshot"> | VersionRecord)[],
  source: HistorySource = "platform",
): HistoryEventInput[] {
  const events: HistoryEventInput[] = [];
  for (const version of versions) {
    events.push({
      eventType: version.changeType === "initial" ? "CREATE" : "VERSION_CREATED",
      packageId: version.packageId,
      version: version.semanticVersion,
      actor: version.createdBy,
      operation: version.changeType === "initial" ? "versioning.create" : "versioning.version",
      source,
      timestamp: version.createdAt,
      checksum: version.checksum,
      reason: version.reason,
      details: {
        versionId: version.versionId,
        changeType: version.changeType,
        changeSummary: version.changeSummary,
        parentVersionId: version.parentVersionId,
        lifecycleState: version.lifecycleState,
        trust: version.trustLevel,
      },
    });
    if (version.merge) {
      events.push({
        eventType: "MERGE",
        packageId: version.packageId,
        version: version.semanticVersion,
        actor: version.merge.mergeAuthor,
        operation: "merge.apply",
        source,
        timestamp: version.merge.mergeTimestamp,
        checksum: version.checksum,
        details: {
          mergeId: version.merge.mergeId,
          mergedFrom: version.merge.mergedFrom.join(" + "),
        },
      });
    }
  }
  return events;
}

/** Historial de instalación ⇒ INSTALL / UPDATE / ROLLBACK / UNINSTALL. */
export function fromInstallationEvents(
  events: readonly InstallationEvent[],
  source: HistorySource = "platform",
): HistoryEventInput[] {
  return events.map((event) => ({
    eventType: event.action,
    packageId: event.packageId,
    version: event.version,
    actor: event.actor,
    operation: `installation.${event.action.toLowerCase()}`,
    source,
    timestamp: event.at,
    checksum: event.checksum,
    result: event.result,
    reason: event.message,
    scopeId: event.scopeId,
    previousVersion: event.previousVersion,
    details: {
      installationId: event.installationId,
      rolledBack: event.rolledBack,
    },
  }));
}
