/**
 * FEATURE-003.4 — Gobierno de publicación (Nevermine Platform).
 *
 * Un Knowledge Package no se publica por ser técnicamente correcto: se publica
 * porque *alguien con derecho a hacerlo* lo publica. Esta capa introduce la
 * identidad editorial —el Publisher— y su nivel de confianza.
 *
 * Reglas del modelo:
 *  - Ningún paquete es anónimo: siempre pertenece a exactamente un Publisher.
 *  - La propiedad no cambia durante el ciclo de vida.
 *  - El nivel de confianza lo aporta el Publisher, nunca el paquete por su cuenta.
 *  - Incorporar Community, Enterprise, Partner o Marketplace es registrar otro
 *    Publisher, no modificar el dominio.
 */

/** Naturaleza editorial de un Publisher. */
export type PublisherKind =
  | "official"
  | "community"
  | "enterprise"
  | "partner"
  | "marketplace";

export const PUBLISHER_KINDS: readonly PublisherKind[] = [
  "official",
  "community",
  "enterprise",
  "partner",
  "marketplace",
];

/** Nivel de confianza declarado por la plataforma sobre un Publisher. */
export type TrustLevel = "official" | "verified" | "partner" | "community" | "experimental";

export const TRUST_LEVELS: readonly TrustLevel[] = [
  "official",
  "verified",
  "partner",
  "community",
  "experimental",
];

export function isPublisherKind(value: unknown): value is PublisherKind {
  return typeof value === "string" && (PUBLISHER_KINDS as readonly string[]).includes(value);
}

export function isTrustLevel(value: unknown): value is TrustLevel {
  return typeof value === "string" && (TRUST_LEVELS as readonly string[]).includes(value);
}

/** Identidad editorial responsable de uno o varios paquetes. */
export interface Publisher {
  id: string;
  name: string;
  kind: PublisherKind;
  /** Confianza que la plataforma otorga a todo lo que publica esta identidad. */
  trust: TrustLevel;
  /** Un Publisher inactivo conserva la propiedad, pero no puede publicar. */
  active: boolean;
  /** Autorización explícita de publicación (gobierno, no seguridad de datos). */
  canPublish: boolean;
  contact?: string | null;
}

export const NEVERMINE_OFFICIAL_PUBLISHER_ID = "nevermine_official";

/** Único Publisher operativo en esta Feature. */
export const nevermineOfficialPublisher: Publisher = Object.freeze({
  id: NEVERMINE_OFFICIAL_PUBLISHER_ID,
  name: "Nevermine Official",
  kind: "official",
  trust: "official",
  active: true,
  canPublish: true,
  contact: null,
});

const PUBLISHER_ID_RE = /^[a-z][a-z0-9_]{1,63}$/;

/** Errores de forma de un Publisher (lista vacía = válido). */
export function checkPublisher(publisher: Publisher): string[] {
  const errors: string[] = [];
  if (!publisher || typeof publisher !== "object") return ["Publisher no válido."];
  if (!PUBLISHER_ID_RE.test(publisher.id ?? "")) {
    errors.push(`Identificador de Publisher no válido: "${publisher?.id}".`);
  }
  if (!publisher.name?.trim()) errors.push(`El Publisher "${publisher.id}" no declara nombre.`);
  if (!isPublisherKind(publisher.kind)) {
    errors.push(`Tipo de Publisher no soportado: "${publisher.kind}".`);
  }
  if (!isTrustLevel(publisher.trust)) {
    errors.push(`Nivel de confianza no válido: "${publisher.trust}".`);
  }
  if (typeof publisher.active !== "boolean") {
    errors.push(`El Publisher "${publisher.id}" no declara si está activo.`);
  }
  if (typeof publisher.canPublish !== "boolean") {
    errors.push(`El Publisher "${publisher.id}" no declara autorización de publicación.`);
  }
  return errors;
}

/** ¿Puede esta identidad publicar hoy? */
export function isAuthorizedToPublish(publisher: Publisher | undefined): boolean {
  return Boolean(publisher && publisher.active && publisher.canPublish);
}

/**
 * Directorio de identidades editoriales. Es un registro cerrado: un paquete
 * cuyo Publisher no esté aquí no entra en el repositorio.
 */
export class PublisherRegistry {
  private readonly publishers = new Map<string, Publisher>();

  constructor(publishers: readonly Publisher[] = [nevermineOfficialPublisher]) {
    for (const publisher of publishers) this.register(publisher);
  }

  register(publisher: Publisher): { ok: boolean; errors: string[] } {
    const errors = checkPublisher(publisher);
    if (errors.length === 0 && this.publishers.has(publisher.id)) {
      errors.push(`El Publisher "${publisher.id}" ya está registrado.`);
    }
    if (errors.length > 0) return { ok: false, errors };
    this.publishers.set(publisher.id, Object.freeze({ ...publisher }));
    return { ok: true, errors: [] };
  }

  get(publisherId: string): Publisher | undefined {
    return this.publishers.get(publisherId);
  }

  has(publisherId: string): boolean {
    return this.publishers.has(publisherId);
  }

  list(): Publisher[] {
    return [...this.publishers.values()].sort((a, b) => a.name.localeCompare(b.name, "es"));
  }

  canPublish(publisherId: string): boolean {
    return isAuthorizedToPublish(this.get(publisherId));
  }
}

export function createPublisherRegistry(publishers?: readonly Publisher[]): PublisherRegistry {
  return new PublisherRegistry(publishers);
}
