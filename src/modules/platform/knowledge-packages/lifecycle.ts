/**
 * FEATURE-003.3 — Knowledge Distribution Lifecycle (Nevermine Platform).
 *
 * Un Knowledge Package no es distribuible por el hecho de existir: recorre un
 * ciclo de vida explícito y trazable. Esta capa pertenece a la plataforma y no
 * conoce ningún producto (Coach, Health, Legal…): sólo estados, transiciones
 * permitidas e historial.
 *
 * Reglas del modelo:
 *  - No existen transiciones implícitas: cada cambio de estado es una orden.
 *  - Sólo se publica lo certificado; sólo se instala lo publicado.
 *  - El historial es append-only: nunca se edita ni se borra una transición.
 */

/** Estados del ciclo de vida de distribución. */
export type LifecycleState =
  | "draft"
  | "review"
  | "certified"
  | "published"
  | "deprecated"
  | "archived";

export const LIFECYCLE_STATES: readonly LifecycleState[] = [
  "draft",
  "review",
  "certified",
  "published",
  "deprecated",
  "archived",
];

/** Estados desde los que un paquete puede instalarse. */
export const DISTRIBUTABLE_STATES: readonly LifecycleState[] = ["published"];

/**
 * Máquina de estados. Toda transición no listada aquí es ilegal, incluida la
 * transición a uno mismo. `archived` es terminal.
 */
export const LIFECYCLE_TRANSITIONS: Readonly<Record<LifecycleState, readonly LifecycleState[]>> = {
  draft: ["review", "archived"],
  review: ["certified", "draft", "archived"],
  certified: ["published", "review", "archived"],
  published: ["deprecated", "archived"],
  deprecated: ["archived"],
  archived: [],
};

export function isLifecycleState(value: unknown): value is LifecycleState {
  return typeof value === "string" && (LIFECYCLE_STATES as readonly string[]).includes(value);
}

/** ¿Puede instalarse un paquete en este estado? */
export function isDistributableState(state: LifecycleState): boolean {
  return DISTRIBUTABLE_STATES.includes(state);
}

/** Estados alcanzables en un solo paso desde `state`. */
export function allowedTransitions(state: LifecycleState): readonly LifecycleState[] {
  return LIFECYCLE_TRANSITIONS[state] ?? [];
}

export function canTransition(from: LifecycleState, to: LifecycleState): boolean {
  return allowedTransitions(from).includes(to);
}

/** Registro inmutable de una transición efectuada. */
export interface LifecycleTransition {
  packageId: string;
  version: string;
  from: LifecycleState;
  to: LifecycleState;
  /** Quién ordena la transición (usuario, sistema, pipeline). */
  actor: string;
  reason: string | null;
  /** ISO 8601. */
  at: string;
  /** Checksum del paquete en el momento de la transición (trazabilidad). */
  checksum: string | null;
  /** Evidencia de la certificación automática, cuando aplica. */
  evidence: Record<string, unknown> | null;
}

export interface TransitionRequest {
  to: LifecycleState;
  actor?: string;
  reason?: string | null;
  checksum?: string | null;
  evidence?: Record<string, unknown> | null;
  /** ISO 8601; se inyecta para poder testear de forma determinista. */
  at?: string;
}

export type TransitionResult =
  | { ok: true; transition: LifecycleTransition }
  | { ok: false; errors: string[] };

/**
 * Evalúa una transición sin efectos secundarios. La validación de negocio
 * previa a `certified`/`published` (certificación, integridad, dependencias)
 * la aporta quien llama mediante `guardErrors`.
 */
export function evaluateTransition(
  packageId: string,
  version: string,
  from: LifecycleState,
  request: TransitionRequest,
  guardErrors: readonly string[] = [],
): TransitionResult {
  const errors: string[] = [];

  if (!isLifecycleState(request.to)) {
    return { ok: false, errors: [`Estado de destino no válido: "${String(request.to)}".`] };
  }
  if (!canTransition(from, request.to)) {
    const allowed = allowedTransitions(from);
    errors.push(
      allowed.length === 0
        ? `El paquete "${packageId}" está en estado final "${from}": no admite más transiciones.`
        : `Transición no permitida "${from}" → "${request.to}". Permitidas: ${allowed.join(", ")}.`,
    );
  }
  errors.push(...guardErrors);
  if (errors.length > 0) return { ok: false, errors };

  return {
    ok: true,
    transition: {
      packageId,
      version,
      from,
      to: request.to,
      actor: request.actor?.trim() || "system",
      reason: request.reason?.trim() || null,
      at: request.at ?? new Date().toISOString(),
      checksum: request.checksum ?? null,
      evidence: request.evidence ?? null,
    },
  };
}

/**
 * Historial append-only de transiciones. No expone ninguna operación de
 * modificación ni de borrado: la única escritura posible es añadir.
 */
export class LifecycleHistory {
  private readonly entries: LifecycleTransition[] = [];

  append(transition: LifecycleTransition): LifecycleTransition {
    this.entries.push(Object.freeze({ ...transition }));
    return transition;
  }

  /** Todas las transiciones en orden cronológico de registro. */
  all(): readonly LifecycleTransition[] {
    return [...this.entries];
  }

  /** Historial de un paquete (opcionalmente de una versión concreta). */
  of(packageId: string, version?: string): readonly LifecycleTransition[] {
    return this.entries.filter(
      (e) => e.packageId === packageId && (version ? e.version === version : true),
    );
  }

  /** Última transición registrada de una versión. */
  last(packageId: string, version: string): LifecycleTransition | undefined {
    const list = this.of(packageId, version);
    return list[list.length - 1];
  }

  get size(): number {
    return this.entries.length;
  }
}
