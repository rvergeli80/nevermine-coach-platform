/**
 * FEATURE-003.10 — State Reconstruction.
 *
 * El estado no se guarda: se **deduce**. Aplicando los eventos registrados en
 * orden cronológico hasta un instante dado se obtiene exactamente el estado
 * que tenía la configuración en ese momento. No se usan snapshots adicionales.
 */

import type { TrustLevel } from "../governance";
import type { LifecycleState } from "../lifecycle";
import { searchEvents } from "./search";
import type { HistoryEvent, ReconstructedState } from "./types";

const asString = (value: unknown): string | null =>
  typeof value === "string" && value.trim() !== "" ? value : null;

export function reconstructState(
  events: readonly HistoryEvent[],
  packageId: string,
  timestamp?: string,
): ReconstructedState {
  // Sin instante explícito se reconstruye "ahora": todos los eventos del paquete.
  const applicable = searchEvents(events, { packageId, to: timestamp });
  const at =
    timestamp ?? applicable[applicable.length - 1]?.timestamp ?? new Date(0).toISOString();

  const versions: string[] = [];
  const published = new Set<string>();
  const installations = new Map<string, string>();
  const merges: string[] = [];
  let exists = false;
  let lifecycleState: LifecycleState | null = null;
  let trustLevel: TrustLevel | null = null;
  let certified = false;
  let checksum: string | null = null;

  const track = (version: string | null) => {
    if (version && !versions.includes(version)) versions.push(version);
  };

  for (const event of applicable) {
    // Un evento fallido no cambia el estado: dejó huella, no efecto.
    if (event.result === "failed") continue;
    exists = true;
    if (event.checksum) checksum = event.checksum;

    switch (event.eventType) {
      case "CREATE":
      case "VERSION_CREATED":
        track(event.version);
        break;
      case "MERGE": {
        track(event.version);
        const mergeId = asString(event.details.mergeId);
        if (mergeId && !merges.includes(mergeId)) merges.push(mergeId);
        break;
      }
      case "PUBLISH":
        track(event.version);
        if (event.version) published.add(event.version);
        break;
      case "UNPUBLISH":
        if (event.version) published.delete(event.version);
        break;
      case "INSTALL":
      case "UPDATE":
      case "ROLLBACK":
        track(event.version);
        if (event.scopeId && event.version && event.result === "success") {
          installations.set(event.scopeId, event.version);
        }
        break;
      case "UNINSTALL":
        if (event.scopeId) installations.delete(event.scopeId);
        break;
      case "LIFECYCLE_CHANGED":
        lifecycleState = (asString(event.details.to) as LifecycleState | null) ?? lifecycleState;
        break;
      case "TRUST_CHANGED":
        trustLevel = (asString(event.details.to) as TrustLevel | null) ?? trustLevel;
        break;
      case "CERTIFICATION_CHANGED":
        certified = event.details.certified === true;
        break;
      // COMPARE y DISCOVER_UPDATE son lecturas: quedan registradas, no alteran nada.
      default:
        break;
    }
  }

  const last = applicable[applicable.length - 1] ?? null;
  return {
    packageId,
    at,
    exists,
    latestVersion: versions.length > 0 ? versions[versions.length - 1] : null,
    versions,
    lifecycleState,
    trustLevel,
    certified,
    publishedVersions: [...published].sort(),
    installations: Object.fromEntries([...installations.entries()].sort()),
    merges,
    appliedEvents: applicable.length,
    lastEventId: last?.eventId ?? null,
    checksum,
  };
}
