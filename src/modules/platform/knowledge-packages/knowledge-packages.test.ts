import { describe, expect, it } from "vitest";

import {
  UNSIGNED,
  checkCompatibility,
  checkDescriptor,
  checksumOf,
  checksumOfDescriptor,
  createKnowledgePackageRepository,
  dependentsOf,
  resolveDependencies,
  verifyIntegrity,
  type HostEnvironment,
  type KnowledgePackageDescriptor,
} from "./index";

const host: HostEnvironment = {
  product: "coach",
  productVersion: "1.0.0",
  engines: [{ engine: "sportspace", version: "1.0.0" }],
};

function pkg(over: Partial<KnowledgePackageDescriptor> = {}): KnowledgePackageDescriptor {
  const base = {
    id: "base_pack",
    name: "Paquete base",
    summary: "Conocimiento de prueba.",
    kind: "starter_pack" as const,
    origin: "official" as const,
    status: "published" as const,
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

describe("integridad", () => {
  it("produce el mismo checksum independientemente del orden de claves", () => {
    expect(checksumOf({ a: 1, b: [1, 2] })).toBe(checksumOf({ b: [1, 2], a: 1 }));
    expect(checksumOf({ a: 1 })).not.toBe(checksumOf({ a: 2 }));
  });

  it("detecta contenido manipulado", () => {
    const original = pkg();
    expect(verifyIntegrity(original)).toEqual({ ok: true, signed: false });
    const tampered = { ...original, payload: { hello: "otro" } };
    const result = verifyIntegrity(tampered);
    expect(result.ok).toBe(false);
  });

  it("acepta paquetes sin firma y rechaza algoritmos aún no soportados", () => {
    expect(verifyIntegrity(pkg()).signed).toBe(false);
    const signed = pkg();
    const bad = { ...signed, signature: { ...signed.signature, algorithm: "ed25519" as never } };
    expect(verifyIntegrity(bad).ok).toBe(false);
  });
});

describe("validación de descriptores", () => {
  it("acepta un descriptor bien formado", () => {
    expect(checkDescriptor(pkg())).toEqual([]);
  });

  it("rechaza identificadores, versiones y compatibilidad no válidos", () => {
    expect(checkDescriptor(pkg({ id: "Mal Id" })).length).toBeGreaterThan(0);
    expect(checkDescriptor(pkg({ version: "1.0" })).length).toBeGreaterThan(0);
    expect(
      checkDescriptor(pkg({ compatibility: { products: [], engines: [] } })).length,
    ).toBeGreaterThan(0);
  });

  it("rechaza autodependencias y dependencias duplicadas", () => {
    const self = pkg({ dependencies: [{ packageId: "base_pack", minVersion: "1.0.0" }] });
    expect(checkDescriptor(self).join(" ")).toContain("sí mismo");
    const dup = pkg({
      dependencies: [
        { packageId: "otro_pack", minVersion: "1.0.0" },
        { packageId: "otro_pack", minVersion: "1.0.0" },
      ],
    });
    expect(checkDescriptor(dup).join(" ")).toContain("duplicada");
  });
});

describe("compatibilidad", () => {
  it("valida producto y engine dentro de rango", () => {
    expect(checkCompatibility(pkg(), host).ok).toBe(true);
  });

  it("rechaza producto no declarado, versión insuficiente y engine ausente", () => {
    expect(checkCompatibility(pkg(), { ...host, product: "health" }).ok).toBe(false);
    const strict = pkg({
      compatibility: {
        products: [{ product: "coach", minVersion: "2.0.0" }],
        engines: [{ engine: "sportspace", minVersion: "1.0.0" }],
      },
    });
    expect(checkCompatibility(strict, host).ok).toBe(false);
    expect(checkCompatibility(pkg(), { ...host, engines: [] }).ok).toBe(false);
  });

  it("respeta la versión máxima declarada", () => {
    const capped = pkg({
      compatibility: {
        products: [{ product: "coach", minVersion: "1.0.0", maxVersion: "1.0.0" }],
        engines: [{ engine: "sportspace", minVersion: "1.0.0" }],
      },
    });
    expect(checkCompatibility(capped, { ...host, productVersion: "1.1.0" }).ok).toBe(false);
  });

  it("no permite instalar paquetes no publicados", () => {
    expect(checkCompatibility(pkg({ status: "deprecated" }), host).ok).toBe(false);
  });
});

describe("dependencias", () => {
  const leaf = pkg({ id: "leaf_pack" });
  const mid = pkg({ id: "mid_pack", dependencies: [{ packageId: "leaf_pack", minVersion: "1.0.0" }] });
  const root = pkg({ id: "root_pack", dependencies: [{ packageId: "mid_pack", minVersion: "1.0.0" }] });
  const all = [leaf, mid, root];
  const lookup = (id: string) => all.find((p) => p.id === id);

  it("ordena las dependencias antes del paquete", () => {
    const result = resolveDependencies(root, lookup);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.order.map((p) => p.id)).toEqual(["leaf_pack", "mid_pack", "root_pack"]);
  });

  it("falla si falta una dependencia obligatoria y omite las opcionales", () => {
    const missing = pkg({ id: "x_pack", dependencies: [{ packageId: "no_existe", minVersion: "1.0.0" }] });
    expect(resolveDependencies(missing, lookup).ok).toBe(false);
    const optional = pkg({
      id: "y_pack",
      dependencies: [{ packageId: "no_existe", minVersion: "1.0.0", optional: true }],
    });
    const result = resolveDependencies(optional, lookup);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.skipped).toEqual(["no_existe"]);
  });

  it("rechaza rangos de versión no satisfechos", () => {
    const demanding = pkg({
      id: "z_pack",
      dependencies: [{ packageId: "leaf_pack", minVersion: "2.0.0" }],
    });
    expect(resolveDependencies(demanding, lookup).ok).toBe(false);
  });

  it("detecta ciclos", () => {
    const a = pkg({ id: "a_pack", dependencies: [{ packageId: "b_pack", minVersion: "1.0.0" }] });
    const b = pkg({ id: "b_pack", dependencies: [{ packageId: "a_pack", minVersion: "1.0.0" }] });
    const cyclic = (id: string) => [a, b].find((p) => p.id === id);
    const result = resolveDependencies(a, cyclic);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.join(" ")).toContain("circular");
  });

  it("identifica los dependientes de un paquete", () => {
    expect(dependentsOf("leaf_pack", all).map((p) => p.id)).toEqual(["mid_pack"]);
  });
});

describe("repositorio", () => {
  it("rechaza descriptores inválidos y versiones duplicadas", () => {
    const repo = createKnowledgePackageRepository();
    expect(repo.register(pkg()).ok).toBe(true);
    expect(repo.register(pkg()).ok).toBe(false);
    expect(repo.register({ ...pkg(), id: "MAL" }).ok).toBe(false);
    expect(repo.rejectedPackages.length).toBe(2);
  });

  it("conoce versiones y devuelve la última publicada", () => {
    const repo = createKnowledgePackageRepository([pkg(), pkg({ version: "1.2.0" }), pkg({ version: "1.1.0" })]);
    expect(repo.versionsOf("base_pack").map((p) => p.version)).toEqual(["1.0.0", "1.1.0", "1.2.0"]);
    expect(repo.latest("base_pack")?.version).toBe("1.2.0");
    expect(repo.get("base_pack", "1.1.0")?.version).toBe("1.1.0");
    expect(repo.list()).toHaveLength(1);
  });

  it("descubre por producto, dominio, categoría, etiqueta, versión y compatibilidad", () => {
    const otro = pkg({
      id: "clinico_pack",
      domain: "clinical",
      category: "cardiology",
      tags: ["salud"],
      compatibility: {
        products: [{ product: "health", minVersion: "1.0.0" }],
        engines: [{ engine: "clinicalspace", minVersion: "1.0.0" }],
      },
    });
    const repo = createKnowledgePackageRepository([pkg(), otro]);

    expect(repo.find({ product: "coach" }).map((p) => p.id)).toEqual(["base_pack"]);
    expect(repo.find({ domain: "clinical" }).map((p) => p.id)).toEqual(["clinico_pack"]);
    expect(repo.find({ category: "waterpolo" }).map((p) => p.id)).toEqual(["base_pack"]);
    expect(repo.find({ tag: "salud" }).map((p) => p.id)).toEqual(["clinico_pack"]);
    expect(repo.find({ version: "1.0.0" })).toHaveLength(2);
    expect(repo.find({ compatibleWith: host }).map((p) => p.id)).toEqual(["base_pack"]);
    expect(repo.find({ search: "conocimiento" })).toHaveLength(2);
    expect(repo.find({ origin: "community" })).toHaveLength(0);
  });

  it("resuelve la instalación con dependencias y bloquea las incompatibles", () => {
    const dep = pkg({ id: "dep_pack" });
    const root = pkg({ id: "app_pack", dependencies: [{ packageId: "dep_pack", minVersion: "1.0.0" }] });
    const repo = createKnowledgePackageRepository([dep, root]);

    const plan = repo.resolveInstall("app_pack", host);
    expect(plan.ok).toBe(true);
    if (plan.ok) expect(plan.order.map((p) => p.id)).toEqual(["dep_pack", "app_pack"]);

    expect(repo.resolveInstall("app_pack", { ...host, product: "legal" }).ok).toBe(false);
    expect(repo.resolveInstall("no_existe", host).ok).toBe(false);
  });
});
