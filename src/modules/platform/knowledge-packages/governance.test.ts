import { describe, expect, it } from "vitest";

import {
  NEVERMINE_OFFICIAL_PUBLISHER_ID,
  PUBLISHER_KINDS,
  PublicationAuditLog,
  PublisherRegistry,
  TRUST_LEVELS,
  UNSIGNED,
  buildPublicationMetadata,
  certifyPackage,
  checkPublisher,
  checksumOfDescriptor,
  createKnowledgePackageRepository,
  evaluatePublicationPolicy,
  isAuthorizedToPublish,
  nevermineOfficialPublisher,
  type HostEnvironment,
  type KnowledgePackageDescriptor,
  type PublicationAuditEntry,
  type Publisher,
} from "./index";

/**
 * FEATURE-003.4 — Knowledge Publication & Governance.
 * Ser técnicamente válido no da derecho a publicar: hace falta identidad,
 * propiedad, confianza y evidencia.
 */

const host: HostEnvironment = {
  product: "coach",
  productVersion: "1.0.0",
  engines: [{ engine: "sportspace", version: "1.0.0" }],
};

function pkg(over: Partial<KnowledgePackageDescriptor> = {}): KnowledgePackageDescriptor {
  const base = {
    id: "governed_pack",
    name: "Paquete gobernado",
    summary: "Conocimiento de prueba.",
    kind: "starter_pack" as const,
    origin: "official" as const,
    status: "draft" as const,
    publisher: NEVERMINE_OFFICIAL_PUBLISHER_ID,
    trust: "official" as const,
    version: "1.0.0",
    author: "Nevermine Platform",
    publishedAt: "2026-01-01",
    domain: "sport",
    category: "waterpolo",
    tags: ["waterpolo"],
    compatibility: {
      products: [{ product: "coach", minVersion: "1.0.0", maxVersion: null }],
      engines: [{ engine: "sportspace", minVersion: "1.0.0", maxVersion: null }],
    },
    dependencies: [],
    signature: UNSIGNED,
    payload: { hello: "world" },
    ...over,
  };
  return { ...base, checksum: checksumOfDescriptor(base) };
}

const repo = (descriptors: KnowledgePackageDescriptor[] = [], publishers?: Publisher[]) =>
  createKnowledgePackageRepository(descriptors, { hosts: [host], publishers });

function certified(descriptor: KnowledgePackageDescriptor) {
  const r = repo([descriptor]);
  const result = r.transition(descriptor.id, descriptor.version, { to: "review", actor: "qa" });
  expect(result.ok).toBe(true);
  expect(r.transition(descriptor.id, descriptor.version, { to: "certified", actor: "qa" }).ok).toBe(true);
  return r;
}

describe("Publisher", () => {
  it("soporta los cinco tipos previstos sin tocar el dominio", () => {
    expect(PUBLISHER_KINDS).toEqual(["official", "community", "enterprise", "partner", "marketplace"]);
  });

  it("declara los cinco niveles de confianza", () => {
    expect(TRUST_LEVELS).toEqual(["official", "verified", "partner", "community", "experimental"]);
  });

  it("registra Nevermine Official por defecto", () => {
    const r = repo();
    expect(r.listPublishers().map((p) => p.id)).toEqual([NEVERMINE_OFFICIAL_PUBLISHER_ID]);
    expect(r.canPublish(NEVERMINE_OFFICIAL_PUBLISHER_ID)).toBe(true);
  });

  it("rechaza Publishers mal formados", () => {
    expect(checkPublisher({ ...nevermineOfficialPublisher, id: "Mal Id" }).length).toBeGreaterThan(0);
    expect(checkPublisher({ ...nevermineOfficialPublisher, trust: "gold" as never }).length).toBe(1);
    expect(checkPublisher(nevermineOfficialPublisher)).toEqual([]);
  });

  it("no autoriza a publicar a un Publisher inactivo o sin permiso", () => {
    expect(isAuthorizedToPublish({ ...nevermineOfficialPublisher, active: false })).toBe(false);
    expect(isAuthorizedToPublish({ ...nevermineOfficialPublisher, canPublish: false })).toBe(false);
    expect(isAuthorizedToPublish(undefined)).toBe(false);
  });

  it("no admite dos veces la misma identidad", () => {
    const registry = new PublisherRegistry();
    expect(registry.register(nevermineOfficialPublisher).ok).toBe(false);
  });
});

describe("Ownership", () => {
  it("rechaza paquetes anónimos", () => {
    const result = repo().register(pkg({ publisher: "" as never }));
    expect(result.ok).toBe(false);
    expect(result.errors.join(" ")).toContain("anónimo");
  });

  it("rechaza paquetes de un Publisher no registrado", () => {
    const result = repo().register(pkg({ publisher: "otra_editorial" }));
    expect(result.ok).toBe(false);
    expect(result.errors.join(" ")).toContain("no está registrado");
  });

  it("mantiene la propiedad durante todo el ciclo de vida", () => {
    const descriptor = pkg();
    const r = certified(descriptor);
    expect(r.publisherOf(descriptor.id, descriptor.version)?.id).toBe(NEVERMINE_OFFICIAL_PUBLISHER_ID);
    r.publish(descriptor.id, descriptor.version, { actor: "release-bot" });
    r.transition(descriptor.id, descriptor.version, { to: "deprecated", actor: "release-bot" });
    expect(r.publisherOf(descriptor.id, descriptor.version)?.id).toBe(NEVERMINE_OFFICIAL_PUBLISHER_ID);
  });

  it("exige coherencia entre el nivel de confianza del paquete y el del Publisher", () => {
    const result = repo().register(pkg({ trust: "community" }));
    expect(result.ok).toBe(false);
    expect(result.errors.join(" ")).toContain("no coincide con el del Publisher");
  });
});

describe("Publication Policy", () => {
  it("publica cuando se cumplen todos los controles", () => {
    const descriptor = pkg();
    const r = certified(descriptor);
    const decision = r.evaluatePublication(descriptor.id, descriptor.version);
    expect(decision.ok).toBe(true);
    expect(decision.checks.map((c) => c.id)).toEqual([
      "publisher",
      "ownership",
      "trust",
      "lifecycle",
      "certification",
      "compatibility",
      "integrity",
    ]);
    expect(r.publish(descriptor.id, descriptor.version, { actor: "release-bot" }).ok).toBe(true);
    expect(r.stateOf(descriptor.id, descriptor.version)).toBe("published");
    expect(r.isDistributable(descriptor.id, descriptor.version)).toBe(true);
  });

  it("rechaza publicar lo que no está certificado", () => {
    const descriptor = pkg();
    const r = repo([descriptor]);
    const result = r.publish(descriptor.id, descriptor.version);
    expect(result.ok).toBe(false);
    expect(r.stateOf(descriptor.id, descriptor.version)).toBe("draft");
  });

  it("rechaza publicar si el Publisher no está autorizado", () => {
    const descriptor = pkg();
    const inactive: Publisher = { ...nevermineOfficialPublisher, canPublish: false };
    const r = createKnowledgePackageRepository([descriptor], { hosts: [host], publishers: [inactive] });
    r.transition(descriptor.id, descriptor.version, { to: "review" });
    r.transition(descriptor.id, descriptor.version, { to: "certified" });
    const result = r.publish(descriptor.id, descriptor.version);
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.errors.join(" ")).toContain("no está autorizado");
    expect(r.stateOf(descriptor.id, descriptor.version)).toBe("certified");
  });

  it("rechaza publicar con integridad rota", () => {
    // Un descriptor manipulado ni siquiera entra en el repositorio…
    const tampered = { ...pkg(), checksum: "0000000000000000" };
    expect(repo().register(tampered).ok).toBe(false);
    // …y si se evalúa la política directamente, el control de integridad falla.
    const decision = evaluatePublicationPolicy({
      descriptor: tampered,
      publisher: nevermineOfficialPublisher,
      state: "certified",
      certification: certifyPackage(tampered, { hosts: [host] }),
    });
    expect(decision.ok).toBe(false);
    expect(decision.checks.find((c) => c.id === "integrity")?.ok).toBe(false);
  });

  it("rechaza publicar lo incompatible con los entornos de la plataforma", () => {
    const descriptor = pkg({
      compatibility: {
        products: [{ product: "coach", minVersion: "9.0.0", maxVersion: null }],
        engines: [{ engine: "sportspace", minVersion: "1.0.0", maxVersion: null }],
      },
    });
    const r = repo([descriptor]);
    r.transition(descriptor.id, descriptor.version, { to: "review" });
    const decision = r.evaluatePublication(descriptor.id, descriptor.version);
    expect(decision.checks.find((c) => c.id === "compatibility")?.ok).toBe(false);
    expect(decision.ok).toBe(false);
  });

  it("evalúa la política de forma pura, sin repositorio", () => {
    const descriptor = pkg();
    const decision = evaluatePublicationPolicy({
      descriptor,
      publisher: nevermineOfficialPublisher,
      state: "certified",
      certification: certifyPackage(descriptor, { hosts: [host] }),
      now: "2026-01-02T00:00:00.000Z",
    });
    expect(decision.ok).toBe(true);
    expect(decision.evaluatedAt).toBe("2026-01-02T00:00:00.000Z");
  });
});

describe("Metadata de publicación", () => {
  it("expone Publisher, confianza, fecha, versión, estado, compatibilidad y checksum", () => {
    const descriptor = pkg();
    const r = certified(descriptor);
    r.publish(descriptor.id, descriptor.version, { actor: "release-bot", at: "2026-02-01T10:00:00.000Z" });
    const meta = r.publicationMetadata(descriptor.id, descriptor.version);
    expect(meta).toMatchObject({
      packageId: descriptor.id,
      version: "1.0.0",
      publisher: { id: NEVERMINE_OFFICIAL_PUBLISHER_ID, name: "Nevermine Official", kind: "official" },
      trust: "official",
      publishedAt: "2026-02-01T10:00:00.000Z",
      lifecycleState: "published",
      checksum: descriptor.checksum,
    });
    expect(meta?.compatibility.products[0].product).toBe("coach");
  });

  it("construye metadatos sin publicar (fecha nula)", () => {
    const descriptor = pkg();
    const meta = buildPublicationMetadata(descriptor, nevermineOfficialPublisher, "certified", null);
    expect(meta.publishedAt).toBeNull();
    expect(meta.lifecycleState).toBe("certified");
  });
});

describe("Auditoría append-only", () => {
  it("registra publicación, obsolescencia y archivado con evidencia", () => {
    const descriptor = pkg();
    const r = certified(descriptor);
    r.publish(descriptor.id, descriptor.version, { actor: "release-bot", reason: "GA" });
    r.transition(descriptor.id, descriptor.version, { to: "deprecated", actor: "release-bot" });
    r.transition(descriptor.id, descriptor.version, { to: "archived", actor: "release-bot" });

    const audit = r.publicationAudit(descriptor.id, descriptor.version);
    expect(audit.map((e) => e.action)).toEqual(["publish", "deprecate", "archive"]);
    expect(audit[0]).toMatchObject({
      publisherId: NEVERMINE_OFFICIAL_PUBLISHER_ID,
      actor: "release-bot",
      reason: "GA",
      trust: "official",
      checksum: descriptor.checksum,
    });
    expect(audit[0].evidence).toBeTruthy();
  });

  it("registra también los intentos rechazados", () => {
    const descriptor = pkg();
    const r = repo([descriptor]);
    r.publish(descriptor.id, descriptor.version, { actor: "release-bot" });
    const audit = r.publicationAudit(descriptor.id);
    expect(audit.map((e) => e.action)).toEqual(["publish_rejected"]);
  });

  it("nunca permite modificar ni borrar un registro histórico", () => {
    const log = new PublicationAuditLog();
    const entry = log.append({
      packageId: "p",
      version: "1.0.0",
      publisherId: NEVERMINE_OFFICIAL_PUBLISHER_ID,
      action: "publish",
      actor: "system",
      reason: null,
      at: "2026-01-01T00:00:00.000Z",
      checksum: "abc",
      trust: "official",
      evidence: null,
    });
    expect(() => {
      (entry as { actor: string }).actor = "otro";
    }).toThrow();
    (log.all() as PublicationAuditEntry[]).splice(0, 1);
    expect(log.size).toBe(1);
    expect(log.byPublisher(NEVERMINE_OFFICIAL_PUBLISHER_ID)).toHaveLength(1);
  });
});

describe("Catálogo oficial de Coach", () => {
  it("pertenece a Nevermine Official y expone metadatos de publicación", async () => {
    const { starterPackPublisher, starterPackPublicationMetadata } = await import(
      "@/modules/starter-packs/repository"
    );
    expect(starterPackPublisher("waterpolo_base")?.id).toBe(NEVERMINE_OFFICIAL_PUBLISHER_ID);
    const meta = starterPackPublicationMetadata("waterpolo_base");
    expect(meta?.trust).toBe("official");
    expect(meta?.lifecycleState).toBe("published");
  });
});
