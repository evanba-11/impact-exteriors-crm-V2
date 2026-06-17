/**
 * Integration test for the Google routes focused on RBAC + the address-validation
 * cache path (served from a recorded fixture so no real Google call is made).
 */
import { describe, it, expect, beforeAll } from "vitest";
import express from "express";
import { storage } from "../storage";
import { registerGoogleRoutes } from "./google";

let app: express.Express;
let adminId: number;

const FIXTURE = {
  formattedAddress: "123 Main St, Greeley, CO 80631, USA",
  addressLine1: "123 Main St", city: "Greeley", state: "CO", postalCode: "80631",
  country: "USA", placeId: "FIXTURE_PLACE", latitude: 40.42, longitude: -104.7,
  googleMapsUrl: "https://www.google.com/maps/search/?api=1&query=FIXTURE_PLACE",
  confidence: "high", verdict: "PREMISE", source: "address_validation",
};

beforeAll(async () => {
  app = express();
  app.use(express.json());
  registerGoogleRoutes(app);

  // Ensure we have an Admin user to act as (insert one if the DB is empty,
  // so the test does not depend on external seed state).
  let admin = storage.getUsers().find((u) => u.role === "Admin") || storage.getUsers()[0];
  if (!admin) {
    storage.insertRaw("users", [{ name: "Test Admin", email: "admin@test.local", role: "Admin" }]);
    admin = storage.getUsers().find((u) => u.role === "Admin")!;
  }
  adminId = admin.id;
});

async function request(method: string, path: string, headers: Record<string, string>, body?: unknown) {
  // Spin the express app on an ephemeral port for a real round-trip.
  const server = app.listen(0);
  const addr = server.address();
  const port = typeof addr === "object" && addr ? addr.port : 0;
  try {
    const res = await fetch(`http://127.0.0.1:${port}${path}`, {
      method,
      headers: { ...(body ? { "Content-Type": "application/json" } : {}), ...headers },
      body: body ? JSON.stringify(body) : undefined,
    });
    const json = await res.json().catch(() => ({}));
    return { status: res.status, json };
  } finally {
    server.close();
  }
}

describe("POST /api/integrations/google/validate-address", () => {
  it("rejects requests without a known user (401)", async () => {
    const r = await request("POST", "/api/integrations/google/validate-address", {}, { address: "x" });
    expect(r.status).toBe(401);
  });

  it("serves a cached (recorded) result without calling Google", async () => {
    const addr = `999 Fixture Ave ${Date.now()}`;
    storage.putCachedValidation(addr, FIXTURE, 60_000);
    const r = await request(
      "POST", "/api/integrations/google/validate-address",
      { "x-user-id": String(adminId) }, { address: addr },
    );
    expect(r.status).toBe(200);
    expect(r.json.cached).toBe(true);
    expect(r.json.placeId).toBe("FIXTURE_PLACE");
    expect(r.json.confidence).toBe("high");
  });
});

describe("RBAC on delete", () => {
  it("blocks non-existent users from deleting (401)", async () => {
    const r = await request(
      "DELETE", "/api/integrations/google/drive/files/abc?opportunity_id=1",
      { "x-user-id": "99999999" },
    );
    expect(r.status).toBe(401);
  });
});
