import { describe, expect, it } from "vitest";
import { demoBusiness } from "../../src/demo/fixtures";
import { createMemoryRepository } from "../../src/repositories/memory-repository";

// First-login business claim (F-1 / NV-2 regression). The Supabase and memory
// repositories must share one rule: an unclaimed business is claimed only by a
// VERIFIED email that equals owner_email exactly, case-insensitively. Neither a
// look-alike/wildcard address nor an unconfirmed email may claim it.
const UNCLAIMED = "a0000000-0000-4000-8000-000000000001";
const verified = (id: string, email: string) => ({ id, email, emailVerified: true });

function repoWithUnclaimed(ownerEmail: string) {
  return createMemoryRepository({
    businesses: [demoBusiness({ id: UNCLAIMED, owner_user_id: null, owner_email: ownerEmail })],
  });
}

describe("findBusinessIdForUser claim", () => {
  it("claims an unclaimed business on an exact, case-insensitive verified match", async () => {
    const { repo, state } = repoWithUnclaimed("owner@clinic.example");
    const id = await repo.findBusinessIdForUser(verified("u1", "OWNER@Clinic.Example"));
    expect(id).toBe(UNCLAIMED);
    expect(state.businesses[0].owner_user_id).toBe("u1");
  });

  it("refuses a look-alike or wildcard address", async () => {
    for (const email of ["own_r@clinic.example", "%@clinic.example", "owner@clinic.example.evil.com"]) {
      const { repo, state } = repoWithUnclaimed("owner@clinic.example");
      expect(await repo.findBusinessIdForUser(verified("att", email))).toBeNull();
      expect(state.businesses[0].owner_user_id).toBeNull();
    }
  });

  it("refuses an unverified email even when it matches exactly", async () => {
    const { repo, state } = repoWithUnclaimed("owner@clinic.example");
    const id = await repo.findBusinessIdForUser({ id: "u1", email: "owner@clinic.example", emailVerified: false });
    expect(id).toBeNull();
    expect(state.businesses[0].owner_user_id).toBeNull();
  });

  it("returns an already-owned business without re-matching email", async () => {
    const { repo } = createMemoryRepository({
      businesses: [demoBusiness({ id: UNCLAIMED, owner_user_id: "u1", owner_email: "owner@clinic.example" })],
    });
    // Different, unverified email: ownership is by user id, so it still resolves.
    expect(await repo.findBusinessIdForUser({ id: "u1", email: "other@x.test", emailVerified: false })).toBe(UNCLAIMED);
  });

  it("gives a second user nothing once the business is claimed", async () => {
    const { repo } = repoWithUnclaimed("owner@clinic.example");
    expect(await repo.findBusinessIdForUser(verified("first", "owner@clinic.example"))).toBe(UNCLAIMED);
    expect(await repo.findBusinessIdForUser(verified("second", "owner@clinic.example"))).toBeNull();
  });
});
