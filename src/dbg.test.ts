import { describe, it } from "vitest";
import { coachHostEnvironment, toKnowledgePackage } from "@/modules/starter-packs/knowledge-package";
import { waterpoloPack } from "@/modules/starter-packs/waterpolo";
import { checksumOfDescriptor } from "@/modules/platform/knowledge-packages/integrity";
import { createKnowledgePackageRepository } from "@/modules/platform/knowledge-packages/repository";
import { DistributionService, PublicationRegistry } from "@/modules/platform/knowledge-packages/distribution";
function d(version: string) {
  const base = toKnowledgePackage({ ...waterpoloPack, version });
  const w = { ...base, status: "certified" as const };
  return { ...w, checksum: checksumOfDescriptor(w) };
}
describe("dbg", () => { it("x", () => {
  const repo = createKnowledgePackageRepository([d("1.0.0"), d("1.1.0")], { hosts: [coachHostEnvironment] });
  const s = new DistributionService({ repository: repo, host: coachHostEnvironment, registry: new PublicationRegistry(), subscription: { channels: ["stable"], allowedTrustLevels: ["official"] } });
  console.log(JSON.stringify(s.publishVersion({ packageId: waterpoloPack.id, version: "1.1.0" })).slice(0,300));
  console.log(JSON.stringify(s.checkForUpdates({ packageId: waterpoloPack.id, installedVersion: "1.0.0" }), null, 1));
}); });
