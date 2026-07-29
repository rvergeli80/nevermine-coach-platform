/**
 * FEATURE-003.2 — Knowledge Packages (Nevermine Platform).
 *
 * Un Knowledge Package es *conocimiento distribuible*: una unidad versionada,
 * verificable y compatible que cualquier producto de la plataforma puede
 * descubrir e instalar. Los Starter Packs de Coach son sólo el primer `kind`
 * soportado; el modelo no menciona ningún producto ni deporte concreto.
 */

/** Tipo de conocimiento que transporta el paquete. */
export type KnowledgePackageKind = "starter_pack";

/**
 * Procedencia del paquete. Sólo se distribuyen `official` en esta Feature;
 * el resto existe en el modelo para que marketplace, comunidad, enterprise y
 * packs privados no obliguen a cambiar el dominio más adelante.
 */
export type KnowledgePackageOrigin =
  | "official"
  | "community"
  | "enterprise"
  | "private"
  | "marketplace";

/** Ciclo de vida del paquete dentro del repositorio. */
export type KnowledgePackageStatus = "draft" | "published" | "deprecated";

/** Nivel de confianza declarado (la certificación llega en Features posteriores). */
export type KnowledgePackageTrust = "unverified" | "certified" | "partner";

/** Producto de plataforma con el que el paquete declara ser compatible. */
export interface ProductRequirement {
  /** Identificador del producto: "coach", "health", "legal"… */
  product: string;
  minVersion: string;
  maxVersion?: string | null;
}

/** Engine requerido para poder instalar el contenido del paquete. */
export interface EngineRequirement {
  /** Identificador del Engine: "sportspace"… */
  engine: string;
  minVersion: string;
  maxVersion?: string | null;
}

export interface KnowledgePackageCompatibility {
  products: ProductRequirement[];
  engines: EngineRequirement[];
}

/** Dependencia hacia otro paquete del repositorio. */
export interface PackageDependency {
  packageId: string;
  minVersion: string;
  maxVersion?: string | null;
  /** Una dependencia opcional ausente no impide instalar. */
  optional?: boolean;
}

/**
 * Sobre de firma. FEATURE-003.2 **prepara** la firma pero no la implementa:
 * los paquetes oficiales viajan como `unsigned` y la verificación se limita
 * al checksum. Añadir firma real será rellenar estos campos.
 */
export interface PackageSignature {
  algorithm: "none";
  value: string | null;
  signer: string | null;
  signedAt: string | null;
}

export const UNSIGNED: PackageSignature = {
  algorithm: "none",
  value: null,
  signer: null,
  signedAt: null,
};

/**
 * Descriptor del paquete: todo lo que el repositorio necesita conocer sin
 * abrir el contenido. `payload` queda opaco para la plataforma; sólo el
 * producto propietario del `kind` sabe interpretarlo e instalarlo.
 */
export interface KnowledgePackageDescriptor<TPayload = unknown> {
  id: string;
  name: string;
  summary: string;
  kind: KnowledgePackageKind;
  origin: KnowledgePackageOrigin;
  status: KnowledgePackageStatus;
  trust: KnowledgePackageTrust;
  version: string;
  author: string;
  /** ISO 8601, sólo fecha. */
  publishedAt: string;
  /** Dominio de conocimiento: "sport", "clinical", "legal"… */
  domain: string;
  /** Categoría dentro del dominio: "waterpolo", "cardiology"… */
  category: string;
  tags: string[];
  compatibility: KnowledgePackageCompatibility;
  dependencies: PackageDependency[];
  /** Huella del contenido; hace verificable la integridad del paquete. */
  checksum: string;
  signature: PackageSignature;
  payload: TPayload;
}

/** Entorno que pretende instalar: producto + Engines disponibles. */
export interface HostEnvironment {
  product: string;
  productVersion: string;
  engines: { engine: string; version: string }[];
}

/** Criterios de descubrimiento. Todos los campos son opcionales (AND entre ellos). */
export interface DiscoveryQuery {
  product?: string;
  domain?: string;
  category?: string;
  kind?: KnowledgePackageKind;
  origin?: KnowledgePackageOrigin | KnowledgePackageOrigin[];
  status?: KnowledgePackageStatus | KnowledgePackageStatus[];
  version?: string;
  tag?: string;
  /** Texto libre sobre nombre, resumen y etiquetas. */
  search?: string;
  /** Sólo los paquetes instalables en este entorno. */
  compatibleWith?: HostEnvironment;
}
