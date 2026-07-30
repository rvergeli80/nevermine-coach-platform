/**
 * FEATURE-003.9 — Publication & Updates (Nevermine Platform).
 *
 * Modelo de la distribución: canales, políticas de actualización, registro de
 * publicaciones y anuncios de actualización disponibles.
 *
 * Alcance estricto de esta capa: **coordinar la disponibilidad y propagación**
 * de versiones ya certificadas. No aprueba, no gobierna, no versiona y no
 * instala; para instalar delega siempre en el Installation Engine.
 */

import type { TrustLevel } from "../governance";
import type { LifecycleState } from "../lifecycle";

/** Canales oficiales de distribución. */
export type DistributionChannel = "stable" | "preview" | "internal";

export const DISTRIBUTION_CHANNELS: readonly DistributionChannel[] = [
  "stable",
  "preview",
  "internal",
];

export const DEFAULT_CHANNEL: DistributionChannel = "stable";

export function isDistributionChannel(value: unknown): value is DistributionChannel {
  return typeof value === "string" && (DISTRIBUTION_CHANNELS as readonly string[]).includes(value);
}

/**
 * Política de actualización declarada por el paquete.
 *  - `automatic`: la actualización puede aplicarse sin intervención humana.
 *  - `notify`: se anuncia y se espera confirmación del consumidor.
 *  - `manual`: sólo se aplica si alguien la solicita explícitamente.
 *
 * La plataforma nunca aplica nada por su cuenta: la política es información
 * que el producto consulta para decidir cómo presentar la actualización.
 */
export type UpdatePolicy = "automatic" | "notify" | "manual";

export const UPDATE_POLICIES: readonly UpdatePolicy[] = ["automatic", "notify", "manual"];

export const DEFAULT_UPDATE_POLICY: UpdatePolicy = "notify";

export function isUpdatePolicy(value: unknown): value is UpdatePolicy {
  return typeof value === "string" && (UPDATE_POLICIES as readonly string[]).includes(value);
}

/** Registro oficial de una versión publicada en un canal. */
export interface PublicationRecord {
  packageId: string;
  version: string;
  /** ISO 8601 del acto de publicación. */
  publishedAt: string;
  publishedBy: string;
  publicationChannel: DistributionChannel;
  lifecycleState: LifecycleState;
  trustLevel: TrustLevel;
  checksum: string;
}

/** Retirada de una publicación: deja de anunciarse, no se borra el histórico. */
export interface PublicationRevocation {
  packageId: string;
  version: string;
  at: string;
  by: string;
  reason: string | null;
}

/** Publicación con su estado vigente en el registro. */
export interface PublicationEntry extends PublicationRecord {
  active: boolean;
  revokedAt: string | null;
  revokedBy: string | null;
  revokeReason: string | null;
}

/** Naturaleza del salto entre la versión instalada y la disponible. */
export type UpdateKind = "major" | "minor" | "patch" | "none";

/** Qué debería hacer el consumidor con la actualización anunciada. */
export type RecommendedAction = "apply" | "confirm" | "manual" | "none";

/** Canales y confianza que acepta una instalación concreta. */
export interface ChannelSubscription {
  channels: readonly DistributionChannel[];
  allowedTrustLevels?: readonly TrustLevel[] | null;
}

/** Anuncio de actualización. Es sólo información: nunca instala nada. */
export interface UpdateAvailability {
  packageId: string;
  scopeId: string | null;
  installedVersion: string | null;
  availableVersion: string | null;
  updateAvailable: boolean;
  updateKind: UpdateKind;
  channel: DistributionChannel | null;
  policy: UpdatePolicy;
  recommendedAction: RecommendedAction;
  trustLevel: TrustLevel | null;
  lifecycleState: LifecycleState | null;
  checksum: string | null;
  publishedAt: string | null;
  /** ¿La versión anunciada es válida para este entorno y esta instalación? */
  compatible: boolean;
  /** Motivos por los que no se anuncia (o por los que no es compatible). */
  reasons: string[];
}

/** Estado de distribución de un paquete: qué hay publicado y dónde. */
export interface DistributionStatus {
  packageId: string;
  publications: PublicationEntry[];
  activePublications: PublicationEntry[];
  /** Última versión activa por canal (null si el canal no tiene nada). */
  latestByChannel: Record<DistributionChannel, string | null>;
  channels: DistributionChannel[];
  updatePolicy: UpdatePolicy;
}

/** Fila del informe de distribución: una instalación frente a lo publicado. */
export interface DistributionReportRow extends UpdateAvailability {
  scopeId: string;
}

/** Informe reutilizable por UI, MCP y CLI. */
export interface DistributionReport {
  generatedAt: string;
  activePublications: PublicationEntry[];
  installations: DistributionReportRow[];
  pendingUpdates: DistributionReportRow[];
  incompatibilities: DistributionReportRow[];
  /** Instalaciones sin ninguna versión publicada en los canales admitidos. */
  unknown: DistributionReportRow[];
  summary: {
    installations: number;
    upToDate: number;
    unknown: number;
    pendingUpdates: number;
    incompatibilities: number;
    activePublications: number;
  };
}
