import { describe, expect, it } from "vitest";

import {
  UNSIGNED,
  allowedTransitions,
  canTransition,
  certifyPackage,
  checksumOfDescriptor,
  createKnowledgePackageRepository,
  evaluateTransition,
  isDistributableState,
  LifecycleHistory,
  LIFECYCLE_STATES,
  type HostEnvironment,
  type KnowledgePackageDescriptor,
} from "./index";

/**
 * FEATURE-003.3 — Knowledge Distribution Lifecycle.
 * Se verifica que existir y ser distribuible son cosas distintas.
 */

const host: HostEnvironment = {
  product: "coach",
  productVersion: "1.0.0",
  engines: [{ engine: "sportspace", version: "1.0.0" }],
};

function pkg(over: Partial<KnowledgePackageDescriptor> = {}): KnowledgePackageDescriptor {
  const base = {
    id: "lifecycle_pack",
    name: "Paquete de ciclo de vida",
    summary: "Conocimiento de prueba.",
    kind: "starter_pack" as const,
    origin: "official" as const,
    status: "draft" as const,
    trust: "unverified" as const,
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

describe("máquina de estados", () => {
  it("declara los seis estados del ciclo de vida", () => {
    expect(LIFECYCLE_STATES).toEqual([
      "draft",
      "review",
      "certified",
      "published",
      "deprecated",
      "archived",
    ]);
  });

  it("sólo considera distribuible el estado publicado", () => {
    for (const state of LIFECYCLE_STATES) {
      expect(isDistributableState(state)).toBe(state === "published");
    }
  });

  it("no permite publicar sin pasar por certificación", () => {
    expect(canTransition("draft", "published")).toBe(false);
    expect(canTransition("review", "published")).toBe(false);
    expect(canTransition("certified", "published")).toBe(true);
  });

  it("trata el estado archivado como final", () => {
    expect(allowedTransitions("archived")).toEqual([]);
    const result = evaluateTransition("p", "1.0.0", "archived", { to: "draft" });
    expect(result.ok).toBe(false);
  });

  it("registra actor, motivo y momento de cada transición", () => {
    const result = evaluateTransition("p", "1.0.0", "draft", {
      to: "review",
      actor: "ana",
      reason: "Listo para revisar",
      at: "2026-07-29T00:00:00.000Z",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.transition).toMatchObject({
      from: "draft",
      to: "review",
      actor: "ana",
      reason: "Listo para revisar",
      at: "2026-07-29T00:00:00.000Z",
    });
  });

  it("rechaza la transición cuando el guardia de negocio falla", () => {
    const result = evaluateTransition("p", "1.0.0", "review", { to: "certified" }, ["checksum roto"]);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors).toContain("checksum roto");
  });
});

describe("historial append-only", () => {
  it("sólo permite añadir y conserva el orden", () => {
    const history = new LifecycleHistory();
    const base = {
      packageId: "p",
      version: "1.0.0",
      actor: "system",
      reason: null,
      at: "2026-07-29T00:00:00.000Z",
      checksum: null,
      evidence: null,
    };
    history.append({ ...base, from: "draft", to: "review" });
    history.append({ ...base, from: "review", to: "certified" });
    expect(history.size).toBe(2);
    expect(history.last("p", "1.0.0")?.to).toBe("certified");
    // Las entradas devueltas son copias congeladas: mutarlas no altera el log.
    expect(() => {
      (history.all()[0] as { to: string }).to = "published";
    }).toThrow();
    expect(history.of("p")[0].to).toBe("review");
  });
});

describe("certificación automática", () => {
  it("certifica un paquete íntegro y compatible", () => {
    const report = certifyPackage(pkg({ status: "published" }), { hosts: [host] });
    expect(report.ok).toBe(true);
    expect(report.signatureVerified).toBe(false);
    expect(report.checks.map((c) => c.id)).toEqual([
      "descriptor",
      "integrity",
      "checksum",
      "compatibility",
      "dependencies",
    ]);
  });

  it("falla cuando el contenido ha sido manipulado", () => {
    const tampered = { ...pkg({ status: "published" }), payload: { hello: "otro" } };
    const report = certifyPackage(tampered, { hosts: [host] });
    expect(report.ok).toBe(false);
    expect(report.checks.find((c) => c.id === "checksum")?.ok).toBe(false);
  });

  it("falla cuando el Engine requerido no está disponible", () => {
    const report = certifyPackage(pkg({ status: "published" }), {
      hosts: [{ product: "coach", productVersion: "1.0.0", engines: [] }],
    });
    expect(report.ok).toBe(false);
    expect(report.checks.find((c) => c.id === "compatibility")?.ok).toBe(false);
  });
});

describe("repositorio con ciclo de vida", () => {
  it("no permite instalar un paquete que no está publicado", () => {
    const repo = createKnowledgePackageRepository([pkg()], { hosts: [host] });
    expect(repo.stateOf("lifecycle_pack", "1.0.0")).toBe("draft");
    expect(repo.isDistributable("lifecycle_pack", "1.0.0")).toBe(false);
    const plan = repo.resolveInstall("lifecycle_pack", host, "1.0.0");
    expect(plan.ok).toBe(false);
  });

  it("recorre el ciclo completo hasta poder distribuirse", () => {
    const repo = createKnowledgePackageRepository([pkg()], { hosts: [host] });
    expect(repo.transition("lifecycle_pack", "1.0.0", { to: "review", actor: "ana" }).ok).toBe(true);
    expect(repo.transition("lifecycle_pack", "1.0.0", { to: "certified", actor: "ci" }).ok).toBe(true);
    expect(repo.transition("lifecycle_pack", "1.0.0", { to: "published", actor: "ana" }).ok).toBe(true);
    expect(repo.isDistributable("lifecycle_pack", "1.0.0")).toBe(true);
    expect(repo.resolveInstall("lifecycle_pack", host, "1.0.0").ok).toBe(true);

    const history = repo.lifecycleHistory("lifecycle_pack", "1.0.0");
    expect(history.map((h) => h.to)).toEqual(["draft", "review", "certified", "published"]);
    expect(history.find((h) => h.to === "certified")?.evidence).toBeTruthy();
  });

  it("deja de distribuir un paquete obsoleto o archivado", () => {
    const repo = createKnowledgePackageRepository([pkg({ status: "published" })], { hosts: [host] });
    expect(repo.isDistributable("lifecycle_pack", "1.0.0")).toBe(true);
    expect(repo.transition("lifecycle_pack", "1.0.0", { to: "deprecated", actor: "ana" }).ok).toBe(true);
    expect(repo.isDistributable("lifecycle_pack", "1.0.0")).toBe(false);
    expect(repo.transition("lifecycle_pack", "1.0.0", { to: "published", actor: "ana" }).ok).toBe(false);
  });

  it("rechaza el alta de un paquete publicado que no supera la certificación", () => {
    const broken = { ...pkg({ status: "published" }), checksum: "0000" };
    const repo = createKnowledgePackageRepository([broken], { hosts: [host] });
    expect(repo.has("lifecycle_pack")).toBe(false);
    expect(repo.rejectedPackages[0]?.errors.join(" ")).toMatch(/checksum|Certificación/i);
  });

  it("resuelve dependencias únicamente sobre versiones publicadas", () => {
    const dependency = pkg({ id: "dep_pack", name: "Dependencia", status: "draft" });
    const root = pkg({
      id: "root_pack",
      name: "Raíz",
      status: "published",
      dependencies: [{ packageId: "dep_pack", minVersion: "1.0.0", maxVersion: null, optional: false }],
    });
    const repo = createKnowledgePackageRepository([dependency, root], { hosts: [host] });
    const plan = repo.resolveInstall("root_pack", host, "1.0.0");
    expect(plan.ok).toBe(false);
  });

  it("mantiene el historial de todas las altas y transiciones", () => {
    const repo = createKnowledgePackageRepository([pkg()], { hosts: [host] });
    repo.transition("lifecycle_pack", "1.0.0", { to: "review", actor: "ana" });
    repo.transition("lifecycle_pack", "1.0.0", { to: "archived", actor: "ana", reason: "Descartado" });
    const all = repo.lifecycleHistory();
    expect(all).toHaveLength(3);
    expect(all.at(-1)).toMatchObject({ to: "archived", reason: "Descartado" });
  });
});
