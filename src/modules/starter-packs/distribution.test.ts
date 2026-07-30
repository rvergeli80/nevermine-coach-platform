import { describe, expect, it } from "vitest";

import {
  coachDistribution,
  coachSubscription,
  starterPackDistributionStatus,
  starterPackUpdatePolicy,
} from "./distribution";
import { waterpoloPack } from "./waterpolo";

/**
 * FEATURE-003.9 — Integración de Coach con el Distribution Engine.
 * Coach no busca versiones: consulta al motor de la plataforma.
 */

describe("FEATURE-003.9 — Coach consume el Distribution Engine", () => {
  it("el catálogo oficial está publicado en el canal estable", () => {
    const status = starterPackDistributionStatus(waterpoloPack.id);
    expect(status.channels).toEqual(["stable"]);
    expect(status.activePublications.map((p) => p.version)).toContain(waterpoloPack.version);
    expect(status.latestByChannel.stable).toBe(waterpoloPack.version);
    expect(status.latestByChannel.preview).toBeNull();
  });

  it("la política de actualización es dato del pack y Coach sólo la consulta", () => {
    expect(starterPackUpdatePolicy(waterpoloPack.id)).toBe(
      waterpoloPack.distribution?.updatePolicy ?? "notify",
    );
  });

  it("Coach sólo acepta el canal estable y conocimiento oficial", () => {
    expect(coachSubscription.channels).toEqual(["stable"]);
    expect(coachSubscription.allowedTrustLevels).toEqual(["official"]);
  });

  it("con la última versión instalada no se anuncia ninguna actualización", () => {
    const availability = coachDistribution.checkForUpdates({
      packageId: waterpoloPack.id,
      installedVersion: waterpoloPack.version,
      scopeId: "space-1",
    });
    expect(availability.updateAvailable).toBe(false);
    expect(availability.compatible).toBe(true);
    expect(availability.recommendedAction).toBe("none");
  });

  it("un paquete desconocido no genera anuncios", () => {
    const availability = coachDistribution.checkForUpdates({
      packageId: "pack_inexistente",
      installedVersion: "1.0.0",
    });
    expect(availability.updateAvailable).toBe(false);
    expect(availability.reasons.length).toBeGreaterThan(0);
  });
});
