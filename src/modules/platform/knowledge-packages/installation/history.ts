/**
 * FEATURE-003.5 — Historial de instalación append-only.
 *
 * Toda operación deja huella: qué paquete, qué versión, quién, cuándo y con
 * qué resultado. Los registros nunca se editan ni se borran; una corrección
 * es un evento nuevo.
 */

export type InstallationEventAction = "INSTALL" | "UPDATE" | "ROLLBACK" | "UNINSTALL";
export type InstallationEventResult = "success" | "failed" | "noop";

export interface InstallationEvent {
  /** ISO 8601. */
  at: string;
  action: InstallationEventAction;
  packageId: string;
  /** Versión objetivo del evento. */
  version: string;
  /** Versión que había antes del evento (null en la primera instalación). */
  previousVersion: string | null;
  scopeId: string;
  actor: string;
  result: InstallationEventResult;
  installationId: string | null;
  checksum: string | null;
  /** Motivo del fallo o del noop; null cuando la operación fue limpia. */
  message: string | null;
  /** ¿Se restauró automáticamente el estado anterior? */
  rolledBack: boolean;
}

export class InstallationHistory {
  private readonly events: InstallationEvent[] = [];

  append(event: InstallationEvent): InstallationEvent {
    const frozen = Object.freeze({ ...event });
    this.events.push(frozen);
    return frozen;
  }

  all(): readonly InstallationEvent[] {
    return [...this.events];
  }

  of(scopeId: string, packageId?: string): readonly InstallationEvent[] {
    return this.events.filter(
      (e) => e.scopeId === scopeId && (!packageId || e.packageId === packageId),
    );
  }
}
