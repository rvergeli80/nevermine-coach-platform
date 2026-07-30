/**
 * FEATURE-003.4 — Política de publicación, metadatos y auditoría.
 *
 * La publicación es el acto de gobierno de la plataforma: convierte un paquete
 * certificado en un paquete distribuible. Se evalúa de forma pura y explícita:
 * identidad, propiedad, confianza, estado, certificación, compatibilidad e
 * integridad. Si un solo control falla, no hay publicación.
 */

import type { CertificationReport } from "./certification";
import { isAuthorizedToPublish, isTrustLevel, type Publisher, type TrustLevel } from "./governance";
import type { LifecycleState } from "./lifecycle";
import type { KnowledgePackageCompatibility, KnowledgePackageDescriptor } from "./types";

export type PublicationCheckId =
  | "publisher"
  | "ownership"
  | "trust"
  | "lifecycle"
  | "certification"
  | "compatibility"
  | "integrity";

export interface PublicationCheck {
  id: PublicationCheckId;
  label: string;
  ok: boolean;
  errors: string[];
}

export interface PublicationDecision {
  packageId: string;
  version: string;
  ok: boolean;
  checks: PublicationCheck[];
  errors: string[];
  /** ISO 8601. */
  evaluatedAt: string;
}

export interface PublicationPolicyInput {
  descriptor: KnowledgePackageDescriptor;
  /** Identidad resuelta en el registro; `undefined` = desconocida. */
  publisher: Publisher | undefined;
  /** Estado vigente del ciclo de vida antes de publicar. */
  state: LifecycleState;
  certification: CertificationReport;
  /** ISO 8601; inyectable para pruebas deterministas. */
  now?: string;
}

const check = (
  id: PublicationCheckId,
  label: string,
  errors: string[],
): PublicationCheck => ({ id, label, ok: errors.length === 0, errors });

/** Estado desde el que es legítimo publicar. */
export const PUBLISHABLE_FROM: LifecycleState = "certified";

/**
 * Evalúa la política de publicación. Función pura: no muta nada, no persiste
 * nada y no conoce ningún producto.
 */
export function evaluatePublicationPolicy(input: PublicationPolicyInput): PublicationDecision {
  const { descriptor, publisher, state, certification } = input;
  const checks: PublicationCheck[] = [];

  checks.push(
    check(
      "publisher",
      "Publisher registrado, activo y autorizado a publicar",
      !publisher
        ? [`El Publisher "${descriptor?.publisher ?? "?"}" no está registrado en la plataforma.`]
        : !publisher.active
          ? [`El Publisher "${publisher.id}" está inactivo.`]
          : !isAuthorizedToPublish(publisher)
            ? [`El Publisher "${publisher.id}" no está autorizado a publicar.`]
            : [],
    ),
  );

  checks.push(
    check(
      "ownership",
      "El paquete pertenece a exactamente un Publisher",
      !descriptor?.publisher
        ? ["El paquete no declara Publisher: no existen paquetes anónimos."]
        : publisher && descriptor.publisher !== publisher.id
          ? [
              `El paquete pertenece a "${descriptor.publisher}" y no puede publicarlo "${publisher.id}".`,
            ]
          : [],
    ),
  );

  checks.push(
    check(
      "trust",
      "Nivel de confianza válido y coherente con el Publisher",
      !isTrustLevel(descriptor?.trust)
        ? [`Nivel de confianza no válido: "${descriptor?.trust}".`]
        : publisher && descriptor.trust !== publisher.trust
          ? [
              `El nivel de confianza declarado ("${descriptor.trust}") no coincide con el del Publisher ("${publisher.trust}").`,
            ]
          : [],
    ),
  );

  checks.push(
    check(
      "lifecycle",
      `El paquete está en estado "${PUBLISHABLE_FROM}"`,
      state === PUBLISHABLE_FROM
        ? []
        : [`Sólo se publica lo certificado: el paquete está en estado "${state}".`],
    ),
  );

  checks.push(
    check(
      "certification",
      "Certificación automática superada",
      certification.ok ? [] : certification.errors,
    ),
  );

  const compatibility = certification.checks.find((c) => c.id === "compatibility");
  checks.push(
    check(
      "compatibility",
      "Compatibilidad verificada con los entornos de la plataforma",
      compatibility && !compatibility.ok ? compatibility.errors : [],
    ),
  );

  const integrity = certification.checks.filter((c) => c.id === "integrity" || c.id === "checksum");
  checks.push(
    check(
      "integrity",
      "Integridad y checksum reproducibles",
      integrity.flatMap((c) => (c.ok ? [] : c.errors)),
    ),
  );

  const errors = checks.flatMap((c) => c.errors);

  return {
    packageId: descriptor?.id ?? "?",
    version: descriptor?.version ?? "?",
    ok: errors.length === 0,
    checks,
    errors,
    evaluatedAt: input.now ?? new Date().toISOString(),
  };
}

/** Evidencia compacta de la decisión, para adjuntar a la auditoría. */
export function publicationEvidence(decision: PublicationDecision): Record<string, unknown> {
  return {
    policy: "publication",
    ok: decision.ok,
    evaluatedAt: decision.evaluatedAt,
    checks: decision.checks.map((c) => ({ id: c.id, ok: c.ok, errors: c.errors })),
  };
}

/** Metadatos públicos que expone todo paquete publicado. */
export interface PublicationMetadata {
  packageId: string;
  name: string;
  version: string;
  publisher: { id: string; name: string; kind: string };
  trust: TrustLevel;
  /** ISO 8601 del acto de publicación (no la fecha declarada en el descriptor). */
  publishedAt: string | null;
  lifecycleState: LifecycleState;
  compatibility: KnowledgePackageCompatibility;
  checksum: string;
}

export function buildPublicationMetadata(
  descriptor: KnowledgePackageDescriptor,
  publisher: Publisher,
  state: LifecycleState,
  publishedAt: string | null,
): PublicationMetadata {
  return {
    packageId: descriptor.id,
    name: descriptor.name,
    version: descriptor.version,
    publisher: { id: publisher.id, name: publisher.name, kind: publisher.kind },
    trust: descriptor.trust,
    publishedAt,
    lifecycleState: state,
    compatibility: descriptor.compatibility,
    checksum: descriptor.checksum,
  };
}

/** Acciones de gobierno auditables. */
export type PublicationAction = "publish" | "publish_rejected" | "deprecate" | "archive";

/** Registro inmutable de un acto de gobierno. */
export interface PublicationAuditEntry {
  packageId: string;
  version: string;
  publisherId: string;
  action: PublicationAction;
  /** Quién ejecuta la orden (usuario, sistema, pipeline). */
  actor: string;
  reason: string | null;
  /** ISO 8601. */
  at: string;
  checksum: string | null;
  trust: TrustLevel | null;
  evidence: Record<string, unknown> | null;
}

/** Bitácora append-only: sólo admite añadir; nunca editar ni borrar. */
export class PublicationAuditLog {
  private readonly entries: PublicationAuditEntry[] = [];

  append(entry: PublicationAuditEntry): PublicationAuditEntry {
    const frozen = Object.freeze({ ...entry });
    this.entries.push(frozen);
    return frozen;
  }

  all(): readonly PublicationAuditEntry[] {
    return [...this.entries];
  }

  of(packageId: string, version?: string): readonly PublicationAuditEntry[] {
    return this.entries.filter(
      (e) => e.packageId === packageId && (version ? e.version === version : true),
    );
  }

  byPublisher(publisherId: string): readonly PublicationAuditEntry[] {
    return this.entries.filter((e) => e.publisherId === publisherId);
  }

  get size(): number {
    return this.entries.length;
  }
}
