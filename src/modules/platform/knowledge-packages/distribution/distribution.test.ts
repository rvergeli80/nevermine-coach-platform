import { describe, expect, it } from "vitest";

import { coachHostEnvironment } from "../../../starter-packs/knowledge-package";
import { toKnowledgePackage } from "../../../starter-packs/knowledge-package";
import { waterpoloPack } from "../../../starter-packs/waterpolo";
import { checksumOfDescriptor } from "../integrity";
import { createKnowledgePackageRepository, type KnowledgePackageRepository } from "../repository";
import type { LifecycleState } from "../lifecycle";
import { InstallationService } from "../installation/service";
import type { InstallationExecutionContext, InstallationExecutor } from "../installation/service";
import { InMemoryInstallationManifestStore } from "../installation/manifest";
import { DistributionService } from "./service";
import { PublicationRegistry } from "./registry";
import { classifyUpdate, recommendAction, resolveUpdatePolicy } from "./policy";
import type { StarterPack } from "../../../starter-packs/types";

/**
 * FEATURE-003.9 — El motor de distribución se prueba contra el catálogo real
 * de Coach: publica, retira, anuncia y delega. Nunca instala por su cuenta.
 */

const SCOPE = "space-1";

function descriptorOf(
  version: string,
  status: LifecycleState = "certified",
  distribution?: StarterPack["distribution"],
) {
  const base = toKnowledgePackage({
    ...waterpoloPack,
    version,
    distribution: distribution ?? waterpoloPack.distribution,
  });
  const withStatus = { ...base, status };
  return { ...withStatus, checksum: checksumOfDescriptor(withStatus) };
}

function makeRepository(...descriptors: ReturnType<typeof descriptorOf>[]): KnowledgePackageRepository {
  return createKnowledgePackageRepository(descriptors, { hosts: [coachHostEnvironment] });
}

class RecordingExecutor implements InstallationExecutor {
  readonly applied: InstallationExecutionContext[] = [];
  async apply(context: InstallationExecutionContext) {
    this.applied.push(context);
    return { catalogId: "cat-1" };
  }
  async revert() {}
  async uninstall() {}
}

function makeDistribution(
  repository: KnowledgePackageRepository,
  options: { installations?: InstallationService } = {},
) {
  return new DistributionService({
    repository,
    host: coachHostEnvironment,
    registry: new PublicationRegistry(),
    installations: options.installations,
    subscription: { channels: ["stable"], allowedTrustLevels: ["official"] },
    channelOf: (d) => (d.payload as StarterPack)?.distribution?.channel,
    policyOf: (d) => (d.payload as StarterPack)?.distribution?.updatePolicy,
    now: () => "2026-07-30T00:00:00.000Z",
  });
}

describe("FEATURE-003.9 — Publication Registry", () => {
  it("registra publicaciones y expone la última activa por canal", () => {
    const registry = new PublicationRegistry();
    const base = {
      packageId: "p",
      publishedAt: "2026-01-01T00:00:00.000Z",
      publishedBy: "nevermine_official",
      lifecycleState: "published" as const,
      trustLevel: "official" as const,
      checksum: "abc",
    };
    registry.register({ ...base, version: "1.0.0", publicationChannel: "stable" });
    registry.register({ ...base, version: "1.1.0", publicationChannel: "preview" });

    expect(registry.latestActive("p", ["stable"])?.version).toBe("1.0.0");
    expect(registry.latestActive("p", ["stable", "preview"])?.version).toBe("1.1.0");
    expect(registry.latestByChannel("p")).toMatchObject({ stable: "1.0.0", preview: "1.1.0", internal: null });
  });

  it("retirar una publicación la desactiva pero conserva el histórico", () => {
    const registry = new PublicationRegistry();
    registry.register({
      packageId: "p",
      version: "1.0.0",
      publishedAt: "2026-01-01T00:00:00.000Z",
      publishedBy: "x",
      publicationChannel: "stable",
      lifecycleState: "published",
      trustLevel: "official",
      checksum: "abc",
    });
    expect(registry.revoke({ packageId: "p", version: "1.0.0", at: "2026-02-01", by: "x", reason: "regresión" })).toBeTruthy();
    expect(registry.isActive("p", "1.0.0")).toBe(false);
    expect(registry.active()).toHaveLength(0);
    expect(registry.of("p")[0]).toMatchObject({ active: false, revokeReason: "regresión" });
    // Retirar dos veces no inventa un segundo hecho.
    expect(registry.revoke({ packageId: "p", version: "1.0.0", at: "2026-03-01", by: "x", reason: null })).toBeNull();
  });
});

describe("FEATURE-003.9 — Update Policy", () => {
  it("clasifica el salto de versión", () => {
    expect(classifyUpdate("1.0.0", "2.0.0")).toBe("major");
    expect(classifyUpdate("1.0.0", "1.2.0")).toBe("minor");
    expect(classifyUpdate("1.0.0", "1.0.3")).toBe("patch");
    expect(classifyUpdate("1.0.0", "1.0.0")).toBe("none");
    expect(classifyUpdate("2.0.0", "1.0.0")).toBe("none");
    expect(classifyUpdate(null, "1.0.0")).toBe("none");
  });

  it("recomienda según la política, nunca instala", () => {
    expect(resolveUpdatePolicy(undefined)).toBe("notify");
    expect(recommendAction("automatic", true, true)).toBe("apply");
    expect(recommendAction("notify", true, true)).toBe("confirm");
    expect(recommendAction("manual", true, true)).toBe("manual");
    expect(recommendAction("automatic", false, true)).toBe("none");
    expect(recommendAction("automatic", true, false)).toBe("none");
  });
});

describe("FEATURE-003.9 — DistributionService: publicación", () => {
  it("publica una versión certificada y la registra en su canal", () => {
    const repository = makeRepository(descriptorOf("1.0.0"));
    const distribution = makeDistribution(repository);

    const outcome = distribution.publishVersion({ packageId: waterpoloPack.id, version: "1.0.0", actor: "ana" });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.publication).toMatchObject({
      version: "1.0.0",
      publicationChannel: "stable",
      trustLevel: "official",
      lifecycleState: "published",
      active: true,
    });
    expect(repository.stateOf(waterpoloPack.id, "1.0.0")).toBe("published");
  });

  it("no publica lo que no está certificado", () => {
    const repository = makeRepository(descriptorOf("1.0.0", "certified"));
    // Se lleva la versión a `review`: deja de ser publicable.
    repository.transition(waterpoloPack.id, "1.0.0", { to: "review", actor: "ana" });
    const distribution = makeDistribution(repository);

    const outcome = distribution.publishVersion({ packageId: waterpoloPack.id, version: "1.0.0" });
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.errors.join(" ")).toContain("certified");
    expect(distribution.registry.active()).toHaveLength(0);
  });

  it("una versión inexistente no puede publicarse", () => {
    const distribution = makeDistribution(makeRepository(descriptorOf("1.0.0")));
    const outcome = distribution.publishVersion({ packageId: waterpoloPack.id, version: "9.9.9" });
    expect(outcome.ok).toBe(false);
  });

  it("retirar una publicación deja de anunciarla", () => {
    const repository = makeRepository(descriptorOf("1.0.0"), descriptorOf("1.1.0"));
    const distribution = makeDistribution(repository);
    distribution.publishVersion({ packageId: waterpoloPack.id, version: "1.0.0" });
    distribution.publishVersion({ packageId: waterpoloPack.id, version: "1.1.0" });

    expect(distribution.updateAvailable(waterpoloPack.id, "1.0.0")).toBe(true);
    expect(distribution.unpublishVersion({ packageId: waterpoloPack.id, version: "1.1.0", reason: "regresión" }).ok).toBe(true);
    expect(distribution.updateAvailable(waterpoloPack.id, "1.0.0")).toBe(false);
    // El histórico permanece: la publicación existió.
    expect(distribution.getDistributionStatus(waterpoloPack.id).publications).toHaveLength(2);
    expect(distribution.getDistributionStatus(waterpoloPack.id).activePublications).toHaveLength(1);
  });
});

describe("FEATURE-003.9 — Update Discovery", () => {
  it("anuncia la actualización disponible con su tipo, canal y política", () => {
    const repository = makeRepository(descriptorOf("1.0.0"), descriptorOf("1.1.0"));
    const distribution = makeDistribution(repository);
    distribution.publishVersion({ packageId: waterpoloPack.id, version: "1.0.0" });
    distribution.publishVersion({ packageId: waterpoloPack.id, version: "1.1.0" });

    const availability = distribution.checkForUpdates({
      packageId: waterpoloPack.id,
      installedVersion: "1.0.0",
      scopeId: SCOPE,
    });

    expect(availability).toMatchObject({
      updateAvailable: true,
      availableVersion: "1.1.0",
      updateKind: "minor",
      channel: "stable",
      policy: "notify",
      recommendedAction: "confirm",
      compatible: true,
      trustLevel: "official",
      lifecycleState: "published",
    });
    expect(availability.reasons).toEqual([]);
  });

  it("nunca anuncia una versión de un canal no admitido", () => {
    const repository = makeRepository(
      descriptorOf("1.0.0"),
      descriptorOf("1.1.0", "certified", { channel: "preview", updatePolicy: "notify" }),
    );
    const distribution = makeDistribution(repository);
    distribution.publishVersion({ packageId: waterpoloPack.id, version: "1.0.0" });
    distribution.publishVersion({ packageId: waterpoloPack.id, version: "1.1.0" });

    const stable = distribution.checkForUpdates({ packageId: waterpoloPack.id, installedVersion: "1.0.0" });
    expect(stable.updateAvailable).toBe(false);
    expect(stable.availableVersion).toBe("1.0.0");

    // Un consumidor suscrito a preview sí la ve.
    const preview = distribution.checkForUpdates(
      { packageId: waterpoloPack.id, installedVersion: "1.0.0" },
      { channels: ["stable", "preview"], allowedTrustLevels: ["official"] },
    );
    expect(preview.updateAvailable).toBe(true);
    expect(preview.channel).toBe("preview");
  });

  it("no anuncia una versión cuyo nivel de confianza no admite el consumidor", () => {
    const repository = makeRepository(descriptorOf("1.0.0"), descriptorOf("1.1.0"));
    const distribution = makeDistribution(repository);
    distribution.publishVersion({ packageId: waterpoloPack.id, version: "1.1.0" });

    const availability = distribution.checkForUpdates(
      { packageId: waterpoloPack.id, installedVersion: "1.0.0" },
      { channels: ["stable"], allowedTrustLevels: ["community"] },
    );
    expect(availability.updateAvailable).toBe(false);
    expect(availability.compatible).toBe(false);
    expect(availability.reasons.join(" ")).toContain("confianza");
  });

  it("no anuncia nada cuando no hay publicaciones", () => {
    const distribution = makeDistribution(makeRepository(descriptorOf("1.0.0")));
    const availability = distribution.checkForUpdates({ packageId: waterpoloPack.id, installedVersion: "1.0.0" });
    expect(availability.updateAvailable).toBe(false);
    expect(availability.reasons.join(" ")).toContain("No hay ninguna versión publicada");
  });

  it("descubre actualizaciones para un conjunto de instalaciones", () => {
    const repository = makeRepository(descriptorOf("1.0.0"), descriptorOf("1.1.0"));
    const distribution = makeDistribution(repository);
    distribution.publishVersion({ packageId: waterpoloPack.id, version: "1.1.0" });

    const found = distribution.discoverUpdates([
      { scopeId: SCOPE, packageId: waterpoloPack.id, version: "1.0.0" },
      { scopeId: "space-2", packageId: waterpoloPack.id, version: "1.1.0" },
    ]);
    expect(found.map((f) => f.updateAvailable)).toEqual([true, false]);
    expect(found[0].scopeId).toBe(SCOPE);
  });
});

describe("FEATURE-003.9 — Distribution Report", () => {
  it("resume instalaciones, pendientes, incompatibilidades y publicaciones activas", () => {
    const repository = makeRepository(descriptorOf("1.0.0"), descriptorOf("1.1.0"));
    const distribution = makeDistribution(repository);
    distribution.publishVersion({ packageId: waterpoloPack.id, version: "1.0.0" });
    distribution.publishVersion({ packageId: waterpoloPack.id, version: "1.1.0" });

    const report = distribution.buildReport([
      { scopeId: SCOPE, packageId: waterpoloPack.id, version: "1.0.0" },
      { scopeId: "space-2", packageId: waterpoloPack.id, version: "1.1.0" },
      { scopeId: "space-3", packageId: "pack_inexistente", version: "1.0.0" },
    ]);

    expect(report.generatedAt).toBe("2026-07-30T00:00:00.000Z");
    expect(report.summary).toMatchObject({
      installations: 3,
      pendingUpdates: 1,
      upToDate: 1,
      unknown: 1,
      activePublications: 2,
    });
    expect(report.pendingUpdates[0].scopeId).toBe(SCOPE);
  });
});

describe("FEATURE-003.9 — Integración con el Installation Engine", () => {
  function makeStack() {
    const repository = makeRepository(descriptorOf("1.0.0"), descriptorOf("1.1.0"));
    const executor = new RecordingExecutor();
    const store = new InMemoryInstallationManifestStore();
    const installations = new InstallationService({
      repository,
      host: coachHostEnvironment,
      store,
      executor,
      allowedTrustLevels: ["official"],
    });
    const distribution = makeDistribution(repository, { installations });
    return { repository, executor, store, installations, distribution };
  }

  it("delega la actualización aceptada en el InstallationService", async () => {
    const { distribution, installations, executor } = makeStack();
    distribution.publishVersion({ packageId: waterpoloPack.id, version: "1.0.0" });
    await installations.install({ scopeId: SCOPE, packageId: waterpoloPack.id, version: "1.0.0", actor: "ana" });
    distribution.publishVersion({ packageId: waterpoloPack.id, version: "1.1.0" });

    const result = await distribution.requestUpdate({ scopeId: SCOPE, packageId: waterpoloPack.id, actor: "ana" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.outcome.ok).toBe(true);
    // La ejecución la hace el motor de instalación, no el de distribución.
    expect(executor.applied.at(-1)?.operation).toBe("update");
    const manifest = await installations.manifestOf(SCOPE, waterpoloPack.id);
    expect(manifest?.version).toBe("1.1.0");
    expect(manifest?.previousVersion).toBe("1.0.0");
  });

  it("rechaza actualizar cuando no hay ninguna actualización anunciada", async () => {
    const { distribution, installations } = makeStack();
    distribution.publishVersion({ packageId: waterpoloPack.id, version: "1.0.0" });
    await installations.install({ scopeId: SCOPE, packageId: waterpoloPack.id, version: "1.0.0", actor: "ana" });

    const result = await distribution.requestUpdate({ scopeId: SCOPE, packageId: waterpoloPack.id });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.join(" ")).toContain("actualización anunciada");
  });

  it("nunca instala una versión de un canal no admitido", async () => {
    const repository = makeRepository(
      descriptorOf("1.0.0"),
      descriptorOf("1.1.0", "certified", { channel: "internal", updatePolicy: "automatic" }),
    );
    const executor = new RecordingExecutor();
    const installations = new InstallationService({
      repository,
      host: coachHostEnvironment,
      store: new InMemoryInstallationManifestStore(),
      executor,
      allowedTrustLevels: ["official"],
    });
    const distribution = makeDistribution(repository, { installations });
    distribution.publishVersion({ packageId: waterpoloPack.id, version: "1.0.0" });
    await installations.install({ scopeId: SCOPE, packageId: waterpoloPack.id, version: "1.0.0" });
    distribution.publishVersion({ packageId: waterpoloPack.id, version: "1.1.0" });

    const result = await distribution.requestUpdate({ scopeId: SCOPE, packageId: waterpoloPack.id });
    expect(result.ok).toBe(false);
    const manifest = await installations.manifestOf(SCOPE, waterpoloPack.id);
    expect(manifest?.version).toBe("1.0.0");
  });

  it("informa del ámbito leyendo los manifiestos instalados", async () => {
    const { distribution, installations } = makeStack();
    distribution.publishVersion({ packageId: waterpoloPack.id, version: "1.0.0" });
    await installations.install({ scopeId: SCOPE, packageId: waterpoloPack.id, version: "1.0.0" });
    distribution.publishVersion({ packageId: waterpoloPack.id, version: "1.1.0" });

    const report = await distribution.reportForScope(SCOPE);
    expect(report.summary.installations).toBe(1);
    expect(report.pendingUpdates).toHaveLength(1);
    expect(report.pendingUpdates[0]).toMatchObject({ scopeId: SCOPE, availableVersion: "1.1.0" });
  });

  it("sin Installation Engine asociado no puede ejecutar nada", async () => {
    const distribution = makeDistribution(makeRepository(descriptorOf("1.0.0")));
    const result = await distribution.requestUpdate({ scopeId: SCOPE, packageId: waterpoloPack.id });
    expect(result.ok).toBe(false);
  });
});
