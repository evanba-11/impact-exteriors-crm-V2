import { describe, it, expect, vi, beforeEach } from "vitest";

const qboRequest = vi.fn();
vi.mock("./client", async () => {
  const actual = await vi.importActual<any>("./client");
  return { ...actual, qboRequest: (...a: any[]) => qboRequest(...a), qboQuery: vi.fn() };
});

const upsertCustomerForOpportunity = vi.fn().mockResolvedValue({ qboCustomerId: "C1", created: false });
vi.mock("./customers", () => ({ upsertCustomerForOpportunity: (...a: any[]) => upsertCustomerForOpportunity(...a) }));

const db = { est: null as any, maps: new Map<string, any>(), mapsByQbo: new Map<string, any>(), updates: [] as any[] };
vi.mock("../../storage", () => ({
  storage: {
    getEstimate: () => db.est,
    getMapByCrm: (t: string, id: number) => db.maps.get(`${t}:${id}`) || null,
    getMapByQbo: (t: string, id: string) => db.mapsByQbo.get(`${t}:${id}`) || null,
    upsertMap: (m: any) => {
      db.maps.set(`${m.crmEntityType}:${m.crmEntityId}`, { ...m });
      db.mapsByQbo.set(`${m.qboEntityType}:${m.qboEntityId}`, { ...m });
    },
    updateJob: (id: number, patch: any) => db.updates.push({ id, patch }),
  },
}));

import { invoiceStatus, buildInvoicePayload, pushInvoice, pullInvoiceState } from "./invoices";

const EST = { id: 50, jobId: 1, totalPrice: 10000, sectionsJson: null, createdAt: Date.UTC(2026, 0, 2) } as any;

beforeEach(() => {
  qboRequest.mockReset();
  upsertCustomerForOpportunity.mockClear();
  db.est = { ...EST };
  db.maps = new Map();
  db.mapsByQbo = new Map();
  db.updates = [];
});

describe("invoiceStatus", () => {
  it("classifies paid / partially-paid / unpaid by balance vs total", () => {
    expect(invoiceStatus(100, 0)).toBe("Paid");
    expect(invoiceStatus(100, 40)).toBe("PartiallyPaid");
    expect(invoiceStatus(100, 100)).toBe("Unpaid");
    expect(invoiceStatus(100, -1)).toBe("Paid");
  });
});

describe("buildInvoicePayload", () => {
  it("references the customer and carries the contract total", () => {
    const p: any = buildInvoicePayload(EST, "C1");
    expect(p.CustomerRef).toEqual({ value: "C1" });
    expect(p.TotalAmt).toBe(10000);
    expect(p.Line).toHaveLength(1);
  });
});

describe("pushInvoice", () => {
  it("creates a QBO invoice and stores balance/status on the job", async () => {
    qboRequest.mockResolvedValue({ Invoice: { Id: "INV1", SyncToken: "0", DocNumber: "5001", TotalAmt: 10000, Balance: 10000 } });
    const out = await pushInvoice(50, 7);
    expect(out).toEqual({ qboInvoiceId: "INV1", docNumber: "5001", created: true });
    expect(db.updates[0].patch).toMatchObject({ qboInvoiceId: "INV1", qboInvoiceBalance: 10000, qboInvoiceStatus: "Unpaid" });
  });

  it("never double-pushes: an existing invoice mapping short-circuits", async () => {
    db.maps.set("invoice:50", { qboEntityId: "INV1", qboDocNumber: "5001" });
    const out = await pushInvoice(50, null);
    expect(out).toEqual({ qboInvoiceId: "INV1", docNumber: "5001", created: false });
    expect(qboRequest).not.toHaveBeenCalled();
    expect(upsertCustomerForOpportunity).not.toHaveBeenCalled();
  });
});

describe("pullInvoiceState", () => {
  it("refreshes balance/status from QBO onto the owning job", async () => {
    db.maps.set("invoice:50", { crmEntityType: "invoice", crmEntityId: 50, qboEntityType: "Invoice", qboEntityId: "INV1" });
    db.mapsByQbo.set("Invoice:INV1", { crmEntityId: 50 });
    qboRequest.mockResolvedValue({ Invoice: { Id: "INV1", SyncToken: "2", DocNumber: "5001", TotalAmt: 10000, Balance: 2500 } });
    const out = await pullInvoiceState("INV1", null);
    expect(out).toMatchObject({ opportunityId: 1, status: "PartiallyPaid", balance: 2500 });
    expect(db.updates[0].patch).toMatchObject({ qboInvoiceBalance: 2500, qboInvoiceStatus: "PartiallyPaid" });
  });
});
