import { describe, expect, it } from "vitest";

import {
  buildInstallPlan,
  checkCompatibility,
  checksumOf,
  compareVersions,
  decideInstallAction,
  isUpdateAvailable,
  isValidVersion,
  parseVersion,
  resolveInstallationState,
  starterPacks,
  toCatalogEntry,
  summarizePack,
  type InstallationRecord,
} from "./index";
import { waterpoloPack } from "./waterpolo";

const record = (over: Partial<InstallationRecord> = {}): InstallationRecord => ({
  packId: "waterpolo_base",
  version: "1.0.0",
  checksum: "abc",
  status: "installed",
  installedAt: "2026-01-02T00:00:00Z",
  catalogId: "cat-1",
  catalogVersionId: "ver-1",
  ...over,
});

describe("versionado", () => {
  it("valida y compara versiones semánticas", () => {
    expect(isValidVersion("1.2.3")).toBe(true);
    expect(isValidVersion("1.2")).toBe(false);
    expect(parseVersion("2.10.1")).toEqual({ major: 2, minor: 10, patch: 1 });
    expect(compareVersions("1.0.0", "1.0.1")).toBe(-1);
    expect(compareVersions("1.10.0", "1.9.9")).toBe(1);
    expect(compareVersions("3.0.0", "3.0.0")).toBe(0);
    expect(isUpdateAvailable("1.0.0", "1.1.0")).toBe(true);
    expect(isUpdateAvailable("1.1.0", "1.0.0")).toBe(false);
  });

  it("todos los packs oficiales declaran metadatos válidos", () => {
    for (const pack of starterPacks) {
      expect(isValidVersion(pack.version), pack.id).toBe(true);
      expect(pack.author.length, pack.id).toBeGreaterThan(0);
      expect(pack.origin, pack.id).toBe("official");
      expect(checkCompatibility(pack), pack.id).toEqual([]);
    }
  });
});

describe("plan de instalación", () => {
  it("compila el pack oficial con fórmulas resueltas y checksum estable", () => {
    const built = buildInstallPlan(waterpoloPack);
    expect(built.ok).toBe(true);
    if (!built.ok) return;

    expect(built.plan.packId).toBe(waterpoloPack.id);
    expect(built.plan.version).toBe(waterpoloPack.version);
    expect(built.plan.metrics).toHaveLength(waterpoloPack.metrics.length);
    expect(built.plan.formulas.length).toBe(
      waterpoloPack.metrics.filter((m) => m.nature === "derived").length,
    );
    for (const formula of built.plan.formulas) {
      expect(formula.ast).toBeTruthy();
      expect(formula.dependencies.length).toBeGreaterThan(0);
    }

    const again = buildInstallPlan(waterpoloPack);
    expect(again.ok && again.plan.checksum).toBe(built.plan.checksum);
  });

  it("cambia el checksum cuando cambia el contenido", () => {
    const a = buildInstallPlan(waterpoloPack);
    const b = buildInstallPlan({ ...waterpoloPack, version: "1.1.0" });
    expect(a.ok && b.ok && a.plan.checksum !== b.plan.checksum).toBe(true);
    expect(checksumOf({ x: 1 })).toBe(checksumOf({ x: 1 }));
  });

  it("rechaza packs incompatibles o no publicados sin generar plan", () => {
    const otherEngine = buildInstallPlan({
      ...waterpoloPack,
      compatibility: { engine: "otro", minEngineVersion: "1.0.0" },
    });
    expect(otherEngine.ok).toBe(false);

    const future = buildInstallPlan({
      ...waterpoloPack,
      compatibility: { engine: "sportspace", minEngineVersion: "9.0.0" },
    });
    expect(future.ok).toBe(false);

    const deprecated = buildInstallPlan({ ...waterpoloPack, status: "deprecated" });
    expect(deprecated.ok).toBe(false);
  });

  it("rechaza un pack con contenido inválido", () => {
    const broken = buildInstallPlan({
      ...waterpoloPack,
      metrics: waterpoloPack.metrics.map((m) =>
        m.code === "eficacia_tiro" ? { ...m, formula: "goles / inexistente" } : m,
      ),
    });
    expect(broken.ok).toBe(false);
  });
});

describe("estado de instalación", () => {
  it("resuelve el estado según la versión instalada", () => {
    expect(resolveInstallationState({ version: "1.0.0" }, null)).toBe("not_installed");
    expect(resolveInstallationState({ version: "1.0.0" }, record())).toBe("installed");
    expect(resolveInstallationState({ version: "1.2.0" }, record())).toBe("outdated");
    expect(resolveInstallationState({ version: "1.0.0" }, record({ status: "failed" }))).toBe(
      "failed",
    );
  });

  it("es idempotente: instalar la misma versión no hace nada", () => {
    expect(decideInstallAction({ version: "1.0.0" }, record())).toEqual({
      action: "noop",
      reason: "El pack ya está instalado en la versión 1.0.0.",
    });
  });

  it("decide instalar, actualizar o reinstalar", () => {
    expect(decideInstallAction({ version: "1.0.0" }, null).action).toBe("install");
    expect(decideInstallAction({ version: "1.0.0" }, record({ status: "failed" })).action).toBe(
      "install",
    );
    expect(decideInstallAction({ version: "2.0.0" }, record()).action).toBe("update");
    expect(decideInstallAction({ version: "1.0.0" }, record(), { force: true }).action).toBe(
      "reinstall",
    );
  });

  it("proyecta la entrada de catálogo con la versión instalada", () => {
    const entry = toCatalogEntry(summarizePack(waterpoloPack), record({ version: "0.9.0" }));
    expect(entry.state).toBe("outdated");
    expect(entry.updateAvailable).toBe(true);
    expect(entry.installedVersion).toBe("0.9.0");
    expect(entry.latestVersion).toBe(waterpoloPack.version);
    expect(entry.catalogId).toBe("cat-1");
  });
});
