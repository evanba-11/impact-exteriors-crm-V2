import { describe, it, expect, vi, beforeEach } from "vitest";
import { QboApiError } from "./client";

// Mock the REST layer; assert on the calls our customer logic makes.
const qboRequest = vi.fn();
const qboQuery = vi.fn();
vi.mock("./client", async () => {
  const actual = await vi.importActual<any>("./client");
  return { ...actual, qboRequest: (...a: any[]) => qboRequest(...a), qboQuery: (...a: any[]) => qboQuery(...a) };
});

// In-memory storage stand-in.
const db = {
  job: null as any,
  maps: new Map<string, any>(),
  updates: [] as any[],
};
vi.mock("../../storage", () => ({
  storage: {
    getJob: () => db.job,
    getMapByCrm: (type: string, id: number) => db.maps.get(`${type}:${id}`) || null,
    upsertMap: (m: any) => db.maps.set(`${m.crmEntityType}:${m.crmEntityId}`, { ...db.maps.get(`${m.crmEntityType}:${m.crmEntityId}`), ...m, qboEntityId: m.qboEntityId }),
    updateJob: (id: number, patch: any) => db.updates.push({ id, patch }),
  },
}));

import { buildCustomerPayload, upsertCustomerForOpportunity } from "./customers";
import { checksum } from "./crypto";

const JOB = {
  id: 1, customer: "Jane Roof", classification: "Residential",
  email: "jane@x.com", phone: "555", addressLine1: "9 Oak Ave",
  city: "Greeley", state: "CO", postalCode: "80631",
} as any;

beforeEach(() => {
  qboRequest.mockReset();
  qboQuery.mockReset();
  db.job = { ...JOB };
  db.maps = new Map();
  db.updates = [];
});

describe("buildCustomerPayload", () => {
  it("maps CRM fields to QBO Customer shape", () => {
    const p: any = buildCustomerPayload(JOB);
    expect(p.DisplayName).toBe("Jane Roof");
    expect(p.PrimaryEmailAddr).toEqual({ Address: "jane@x.com" });
    expect(p.BillAddr).toMatchObject({ Line1: "9 Oak Ave", City: "Greeley", CountrySubDivisionCode: "CO", PostalCode: "80631" });
  });
  it("sets CompanyName only for commercial jobs", () => {
    expect((buildCustomerPayload(JOB) as any).CompanyName).toBeUndefined();
    expect((buildCustomerPayload({ ...JOB, classification: "Commercial" }) as any).CompanyName).toBe("Jane Roof");
  });
});

describe("upsertCustomerForOpportunity", () => {
  it("creates a new customer when none is mapped and no DisplayName dupe exists", async () => {
    qboQuery.mockResolvedValue({ QueryResponse: {} }); // no dupe
    qboRequest.mockResolvedValue({ Customer: { Id: "C100", SyncToken: "0", DisplayName: "Jane Roof" } });
    const out = await upsertCustomerForOpportunity(1, 7);
    expect(out).toEqual({ qboCustomerId: "C100", created: true });
    expect(qboRequest).toHaveBeenCalledWith(expect.objectContaining({ method: "POST", action: "customer_create" }));
    expect(db.maps.get("customer:1")).toMatchObject({ qboEntityId: "C100" });
    expect(db.updates[0].patch).toMatchObject({ qboCustomerId: "C100" });
  });

  it("adopts an existing QBO customer with the same DisplayName instead of creating a duplicate", async () => {
    qboQuery.mockResolvedValue({ QueryResponse: { Customer: [{ Id: "C55", SyncToken: "3", DisplayName: "Jane Roof" }] } });
    const out = await upsertCustomerForOpportunity(1, null);
    expect(out).toEqual({ qboCustomerId: "C55", created: false });
    // No create call was made.
    expect(qboRequest).not.toHaveBeenCalled();
    expect(db.maps.get("customer:1")).toMatchObject({ qboEntityId: "C55" });
  });

  it("skips the write when the mapping exists and the payload is unchanged (checksum match)", async () => {
    const sum = checksum(buildCustomerPayload(JOB));
    db.maps.set("customer:1", { crmEntityType: "customer", crmEntityId: 1, qboEntityId: "C9", qboSyncToken: "2", checksum: sum });
    const out = await upsertCustomerForOpportunity(1, null);
    expect(out).toEqual({ qboCustomerId: "C9", created: false });
    expect(qboRequest).not.toHaveBeenCalled();
    expect(qboQuery).not.toHaveBeenCalled();
  });

  it("updates an existing mapping when the payload changed, round-tripping the SyncToken", async () => {
    db.maps.set("customer:1", { crmEntityType: "customer", crmEntityId: 1, qboEntityId: "C9", qboSyncToken: "2", checksum: "stale" });
    qboRequest.mockResolvedValue({ Customer: { Id: "C9", SyncToken: "3", DisplayName: "Jane Roof" } });
    await upsertCustomerForOpportunity(1, null);
    const body = qboRequest.mock.calls[0][0].body;
    expect(body).toMatchObject({ Id: "C9", SyncToken: "2", sparse: true });
  });

  it("refetches + retries once on a 409 SyncToken conflict during update", async () => {
    db.maps.set("customer:1", { crmEntityType: "customer", crmEntityId: 1, qboEntityId: "C9", qboSyncToken: "2", checksum: "stale" });
    qboRequest
      .mockRejectedValueOnce(new QboApiError(409, "stale SyncToken"))     // first update attempt
      .mockResolvedValueOnce({ Customer: { Id: "C9", SyncToken: "9" } })  // getCustomer refetch
      .mockResolvedValueOnce({ Customer: { Id: "C9", SyncToken: "10" } }); // retry update
    const out = await upsertCustomerForOpportunity(1, null);
    expect(out).toEqual({ qboCustomerId: "C9", created: false });
    const retried = qboRequest.mock.calls.find((c) => c[0].action === "customer_update_retry");
    expect(retried![0].body).toMatchObject({ SyncToken: "9" });
  });
});
