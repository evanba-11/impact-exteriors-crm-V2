import { describe, it, expect, vi, beforeEach } from "vitest";
import { QboApiError } from "./client";

const qboRequest = vi.fn();
vi.mock("./client", async () => {
  const actual = await vi.importActual<any>("./client");
  return { ...actual, qboRequest: (...a: any[]) => qboRequest(...a), qboQuery: vi.fn() };
});

const upsertCustomerForOpportunity = vi.fn().mockResolvedValue({ qboCustomerId: "C1", created: false });
vi.mock("./customers", () => ({ upsertCustomerForOpportunity: (...a: any[]) => upsertCustomerForOpportunity(...a) }));

const db = { est: null as any, maps: new Map<string, any>(), updates: [] as any[] };
vi.mock("../../storage", () => ({
  storage: {
    getEstimate: () => db.est,
    getMapByCrm: (t: string, id: number) => db.maps.get(`${t}:${id}`) || null,
    upsertMap: (m: any) => db.maps.set(`${m.crmEntityType}:${m.crmEntityId}`, { ...m }),
    updateJob: (id: number, patch: any) => db.updates.push({ id, patch }),
  },
}));

import { buildEstimateLines, buildEstimatePayload, pushEstimate } from "./estimates";
import { checksum } from "./crypto";

const EST = { id: 50, jobId: 1, totalPrice: 12000, sectionsJson: null, createdAt: Date.UTC(2026, 0, 2) } as any;

beforeEach(() => {
  qboRequest.mockReset();
  upsertCustomerForOpportunity.mockClear();
  db.est = { ...EST };
  db.maps = new Map();
  db.updates = [];
});

describe("buildEstimateLines", () => {
  it("falls back to a single contract-total line when there are no sections", () => {
    const lines = buildEstimateLines(EST) as any[];
    expect(lines).toHaveLength(1);
    expect(lines[0].Amount).toBe(12000);
    expect(lines[0].DetailType).toBe("SalesItemLineDetail");
    expect(lines[0].SalesItemLineDetail.ItemRef).toEqual({ value: "1" });
  });

  it("emits one line per positive section when sections exist", () => {
    const est = { ...EST, sectionsJson: JSON.stringify([{ name: "Tear-off", total: 4000 }, { name: "Install", amount: 8000 }, { name: "Empty", total: 0 }]) };
    const lines = buildEstimateLines(est) as any[];
    expect(lines).toHaveLength(2);
    expect(lines.map((l) => l.Amount)).toEqual([4000, 8000]);
  });
});

describe("buildEstimatePayload", () => {
  it("references the customer and a yyyy-mm-dd TxnDate", () => {
    const p: any = buildEstimatePayload(EST, "C1");
    expect(p.CustomerRef).toEqual({ value: "C1" });
    expect(p.TxnDate).toBe("2026-01-02");
    expect(p.TotalAmt).toBe(12000);
  });
});

describe("pushEstimate", () => {
  it("ensures the customer then creates the QBO estimate, persisting id + doc number", async () => {
    qboRequest.mockResolvedValue({ Estimate: { Id: "E900", SyncToken: "0", DocNumber: "1042" } });
    const out = await pushEstimate(50, 7);
    expect(upsertCustomerForOpportunity).toHaveBeenCalledWith(1, 7);
    expect(out).toEqual({ qboEstimateId: "E900", docNumber: "1042", created: true });
    expect(db.maps.get("estimate:50")).toMatchObject({ qboEntityId: "E900", qboDocNumber: "1042" });
    expect(db.updates[0].patch).toMatchObject({ qboEstimateId: "E900", qboEstimateDocNumber: "1042" });
  });

  it("is idempotent: an unchanged mapping returns without re-pushing", async () => {
    const sum = checksum(buildEstimatePayload(EST, "C1"));
    db.maps.set("estimate:50", { qboEntityId: "E900", qboSyncToken: "1", qboDocNumber: "1042", checksum: sum });
    const out = await pushEstimate(50, null);
    expect(out).toEqual({ qboEstimateId: "E900", docNumber: "1042", created: false });
    expect(qboRequest).not.toHaveBeenCalled();
  });

  it("retries once on a 409 conflict when updating a changed estimate", async () => {
    db.maps.set("estimate:50", { qboEntityId: "E900", qboSyncToken: "1", qboDocNumber: "1042", checksum: "stale" });
    qboRequest
      .mockRejectedValueOnce(new QboApiError(409, "conflict"))
      .mockResolvedValueOnce({ Estimate: { Id: "E900", SyncToken: "5" } })
      .mockResolvedValueOnce({ Estimate: { Id: "E900", SyncToken: "6", DocNumber: "1042" } });
    const out = await pushEstimate(50, null);
    expect(out.created).toBe(false);
    expect(qboRequest.mock.calls.some((c) => c[0].action === "estimate_update_retry")).toBe(true);
  });
});
