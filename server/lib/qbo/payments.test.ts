import { describe, it, expect, vi, beforeEach } from "vitest";

const qboQuery = vi.fn();
const qboRequest = vi.fn();
vi.mock("./client", async () => {
  const actual = await vi.importActual<any>("./client");
  return { ...actual, qboQuery: (...a: any[]) => qboQuery(...a), qboRequest: (...a: any[]) => qboRequest(...a) };
});

// Stub invoice refresh that pullPaymentsForInvoice triggers at the end.
const pullInvoiceState = vi.fn().mockResolvedValue({});
vi.mock("./invoices", () => ({ pullInvoiceState: (...a: any[]) => pullInvoiceState(...a) }));

const db = { mapsByQbo: new Map<string, any>(), est: null as any, payments: [] as any[] };
vi.mock("../../storage", () => ({
  storage: {
    getMapByQbo: (t: string, id: string) => db.mapsByQbo.get(`${t}:${id}`) || null,
    getEstimate: () => db.est,
    upsertPayment: (p: any) => db.payments.push(p),
  },
}));

import { paymentTargetsInvoice, amountForInvoice, pullPaymentsForInvoice } from "./payments";

beforeEach(() => {
  qboQuery.mockReset();
  pullInvoiceState.mockClear();
  db.mapsByQbo = new Map();
  db.est = { id: 50, jobId: 1 };
  db.payments = [];
});

const PAYMENT = {
  Id: "P1", TotalAmt: 2500, TxnDate: "2026-03-01", PaymentRefNum: "CHK-99",
  PaymentMethodRef: { value: "2", name: "Check" },
  Line: [{ Amount: 2500, LinkedTxn: [{ TxnId: "INV1", TxnType: "Invoice" }] }],
};

describe("paymentTargetsInvoice", () => {
  it("is true only when a line links to the invoice", () => {
    expect(paymentTargetsInvoice(PAYMENT as any, "INV1")).toBe(true);
    expect(paymentTargetsInvoice(PAYMENT as any, "INV2")).toBe(false);
  });
});

describe("amountForInvoice", () => {
  it("returns the linked line amount, falling back to TotalAmt", () => {
    expect(amountForInvoice(PAYMENT as any, "INV1")).toBe(2500);
    const noLineAmt = { TotalAmt: 700, Line: [{ LinkedTxn: [{ TxnId: "INV1", TxnType: "Invoice" }] }] };
    expect(amountForInvoice(noLineAmt as any, "INV1")).toBe(700);
  });
});

describe("pullPaymentsForInvoice", () => {
  it("upserts each linked payment into crm_payments and refreshes the invoice", async () => {
    db.mapsByQbo.set("Invoice:INV1", { crmEntityId: 50 });
    qboQuery.mockResolvedValue({ QueryResponse: { Payment: [PAYMENT] } });
    const out = await pullPaymentsForInvoice("INV1", 7);
    expect(out).toMatchObject({ synced: 1, opportunityId: 1 });
    expect(db.payments[0]).toMatchObject({
      jobId: 1, qboPaymentId: "P1", qboInvoiceId: "INV1", amount: 2500, method: "Check", reference: "CHK-99",
    });
    expect(pullInvoiceState).toHaveBeenCalledWith("INV1", 7);
  });

  it("filters out payments that do not actually link to the invoice", async () => {
    db.mapsByQbo.set("Invoice:INV1", { crmEntityId: 50 });
    qboQuery.mockResolvedValue({
      QueryResponse: { Payment: [PAYMENT, { Id: "P2", TotalAmt: 10, Line: [{ LinkedTxn: [{ TxnId: "OTHER", TxnType: "Invoice" }] }] }] },
    });
    const out = await pullPaymentsForInvoice("INV1", null);
    expect(out.synced).toBe(1);
    expect(db.payments).toHaveLength(1);
  });
});
