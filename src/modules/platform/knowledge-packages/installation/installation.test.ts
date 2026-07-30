import { describe, expect, it } from "vitest";
import { knowledgePackages } from "../../../starter-packs/repository";
import { coachHostEnvironment } from "../../../starter-packs/knowledge-package";
import { InstallationService } from "./service";
import type { InstallationExecutionContext, InstallationExecutor } from "./service";
import type { InstallationManifest, InstallationManifestStore } from "./manifest";

/**
 * FEATURE-003.5 — El motor de instalación se prueba contra el repositorio real
 * de Coach: si el catálogo oficial dejara de ser instalable, estos tests lo
 * dirían antes que un usuario.
 */

class MemoryStore implements InstallationManifestStore {
  readonly rows = new Map<string, InstallationManifest>();
  private key = (scope: string, pkg: string) => `${scope}::${pkg}`;

  async get(scopeId: string, packageId: string) {
    return this.rows.get(this.key(scopeId, packageId)) ?? null;
  }
  async list(scopeId: string) {
    return [...this.rows.values()].filter((m) => m.scopeId === scopeId);
  }
  async save(manifest: InstallationManifest) {
    this.rows.set(this.key(manifest.scopeId, manifest.packageId), manifest);
  }
}

class RecordingExecutor implements InstallationExecutor {
  readonly calls: InstallationExecutionContext[] = [];
  reverts = 0;
  uninstalls = 0;
  fail = false;

  async apply(context: InstallationExecutionContext) {
    if (this.fail) throw new Error("fallo simulado al aplicar el contenido");
    this.calls.push(context);
    return { catalogId: "cat-1", groups: 3, metrics: 12 };
  }
  async revert() {
    this.reverts += 1;
  }
  async uninstall() {
    this.uninstalls += 1;
  }
}

const SCOPE = "space-1";
const PACK = knowledgePackages.find({ kind: "starter_pack" })[0];

function makeService(executor = new RecordingExecutor(), store = new MemoryStore()) {
  return {
    executor,
    store,
    service: new InstallationService({
      repository: knowledgePackages,
      host: coachHostEnvironment,
      store,
      executor,
      allowedTrustLevels: ["official"],
    }),
  };
}

describe("FEATURE-003.5 — Installation Engine", () => {
  it("el catálogo oficial de Coach supera la validación previa", () => {
    const { service } = makeService();
    const result = service.validate(PACK.id, PACK.version);
    expect(result.errors).toEqual([]);
    expect(result.ok).toBe(true);
  });

  it("instala y deja un manifiesto con publisher, confianza y checksum", async () => {
    const { service, store } = makeService();
    const outcome = await service.install({ scopeId: SCOPE, packageId: PACK.id, actor: "u1" });
    expect(outcome.ok).toBe(true);
    const manifest = await store.get(SCOPE, PACK.id);
    expect(manifest).toMatchObject({
      packageId: PACK.id,
      version: PACK.version,
      trustLevel: "official",
      checksum: PACK.checksum,
      state: "installed",
    });
  });

  it("es idempotente: reinstalar la misma versión sin forzar no aplica nada", async () => {
    const { service, executor } = makeService();
    await service.install({ scopeId: SCOPE, packageId: PACK.id });
    const again = await service.install({ scopeId: SCOPE, packageId: PACK.id });
    expect(again.ok).toBe(true);
    expect(again.operation).toBe("noop");
    expect(executor.calls).toHaveLength(1);
  });

  it("`force` reinstala y vuelve a aplicar el contenido", async () => {
    const { service, executor } = makeService();
    await service.install({ scopeId: SCOPE, packageId: PACK.id });
    const forced = await service.install({ scopeId: SCOPE, packageId: PACK.id, force: true });
    expect(forced.ok).toBe(true);
    expect(executor.calls).toHaveLength(2);
  });

  it("no actualiza un paquete que no está instalado", async () => {
    const { service } = makeService();
    const outcome = await service.update({ scopeId: SCOPE, packageId: PACK.id });
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.errors.join(" ")).toContain("no está instalado");
  });

  it("rechaza paquetes desconocidos sin tocar el ámbito", async () => {
    const { service, executor } = makeService();
    const outcome = await service.install({ scopeId: SCOPE, packageId: "pack.inexistente" });
    expect(outcome.ok).toBe(false);
    expect(executor.calls).toHaveLength(0);
  });

  it("rechaza un nivel de confianza no admitido", () => {
    const store = new MemoryStore();
    const service = new InstallationService({
      repository: knowledgePackages,
      host: coachHostEnvironment,
      store,
      executor: new RecordingExecutor(),
      allowedTrustLevels: ["community"],
    });
    const result = service.validate(PACK.id, PACK.version);
    expect(result.ok).toBe(false);
    expect(result.errors.join(" ")).toContain("Nivel de confianza");
  });

  it("un fallo del ejecutor restaura el estado anterior y se registra", async () => {
    const { service, executor, store } = makeService();
    executor.fail = true;
    const outcome = await service.install({ scopeId: SCOPE, packageId: PACK.id });
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.rolledBack).toBe(true);
    expect(executor.reverts).toBe(1);
    expect(await store.get(SCOPE, PACK.id)).toBeNull();
    const events = service.listHistory(SCOPE, PACK.id);
    expect(events.at(-1)?.result).toBe("failure");
  });

  it("sin versión anterior no hay rollback posible", async () => {
    const { service } = makeService();
    await service.install({ scopeId: SCOPE, packageId: PACK.id });
    const outcome = await service.rollback({ scopeId: SCOPE, packageId: PACK.id });
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.errors.join(" ")).toContain("rollback");
  });

  it("desinstala marcando el manifiesto, sin borrar el histórico", async () => {
    const { service, executor, store } = makeService();
    await service.install({ scopeId: SCOPE, packageId: PACK.id });
    const outcome = await service.uninstall({ scopeId: SCOPE, packageId: PACK.id, actor: "u1" });
    expect(outcome.ok).toBe(true);
    expect(executor.uninstalls).toBe(1);
    expect((await store.get(SCOPE, PACK.id))?.state).toBe("uninstalled");
    expect(service.listHistory(SCOPE, PACK.id).map((e) => e.action)).toContain("UNINSTALL");
  });

  it("desinstalar dos veces falla: no hay nada que desinstalar", async () => {
    const { service } = makeService();
    await service.install({ scopeId: SCOPE, packageId: PACK.id });
    await service.uninstall({ scopeId: SCOPE, packageId: PACK.id });
    const again = await service.uninstall({ scopeId: SCOPE, packageId: PACK.id });
    expect(again.ok).toBe(false);
  });

  it("el historial es append-only y conserva cada intento", async () => {
    const { service, executor } = makeService();
    await service.install({ scopeId: SCOPE, packageId: PACK.id });
    executor.fail = true;
    await service.install({ scopeId: SCOPE, packageId: PACK.id, force: true });
    const events = service.listHistory(SCOPE, PACK.id);
    expect(events.length).toBeGreaterThanOrEqual(2);
    expect(events.map((e) => e.result)).toContain("failure");
  });
});
