import { describe, it, expect, vi, beforeEach } from "vitest";
import crypto from "node:crypto";

const VERIFIER = "test-verifier-token";
vi.mock("../secrets", () => ({
  getSecret: vi.fn(async (name: string) => (name === "qboWebhookVerifierToken" ? VERIFIER : null)),
  requireSecret: vi.fn(async () => "x"),
}));

// The puller modules are exercised by their own tests; stub them here so processEntity
// routing can be asserted without real API calls.
const pullInvoiceState = vi.fn().mockResolvedValue({});
const pullPaymentsForInvoice = vi.fn().mockResolvedValue({});
const getPayment = vi.fn();
const upsertCustomerForOpportunity = vi.fn().mockResolvedValue({ qboCustomerId: "1", created: false });

vi.mock("./invoices", () => ({ pullInvoiceState: (...a: any[]) => pullInvoiceState(...a) }));
vi.mock("./payments", () => ({
  pullPaymentsForInvoice: (...a: any[]) => pullPaymentsForInvoice(...a),
  getPayment: (...a: any[]) => getPayment(...a),
}));
vi.mock("./customers", () => ({
  upsertCustomerForOpportunity: (...a: any[]) => upsertCustomerForOpportunity(...a),
}));
vi.mock("../../storage", () => ({
  storage: { getMapByQbo: vi.fn(() => ({ crmEntityId: 42 })) },
}));

import { verifySignature, extractEntities, processEntity, processPayload } from "./webhooks";

function sign(body: string): string {
  return crypto.createHmac("sha256", VERIFIER).update(body).digest("base64");
}

beforeEach(() => {
  pullInvoiceState.mockClear();
  pullPaymentsForInvoice.mockClear();
  getPayment.mockReset();
  upsertCustomerForOpportunity.mockClear();
});

describe("verifySignature", () => {
  const body = JSON.stringify({ eventNotifications: [] });

  it("accepts a correctly-signed body", async () => {
    expect(await verifySignature(body, sign(body))).toBe(true);
  });

  it("rejects a tampered body", async () => {
    expect(await verifySignature(body + "x", sign(body))).toBe(false);
  });

  it("rejects a wrong signature of the right length", async () => {
    const bad = crypto.createHmac("sha256", "other-token").update(body).digest("base64");
    expect(await verifySignature(body, bad)).toBe(false);
  });

  it("rejects when the signature header is missing", async () => {
    expect(await verifySignature(body, undefined)).toBe(false);
  });

  it("verifies over a Buffer body identically to a string body", async () => {
    expect(await verifySignature(Buffer.from(body), sign(body))).toBe(true);
  });
});

describe("extractEntities", () => {
  it("flattens entities across notifications", () => {
    const entities = extractEntities({
      eventNotifications: [
        { realmId: "1", dataChangeEvent: { entities: [{ name: "Invoice", id: "10", operation: "Update" }] } },
        { realmId: "1", dataChangeEvent: { entities: [{ name: "Payment", id: "20", operation: "Create" }] } },
      ],
    });
    expect(entities.map((e) => e.name)).toEqual(["Invoice", "Payment"]);
  });
});

describe("processEntity routing", () => {
  it("ignores Delete and Merge operations", async () => {
    await processEntity({ name: "Invoice", id: "1", operation: "Delete" });
    await processEntity({ name: "Customer", id: "1", operation: "Merge" });
    expect(pullInvoiceState).not.toHaveBeenCalled();
  });

  it("pulls invoice + payments for an Invoice event", async () => {
    await processEntity({ name: "Invoice", id: "130", operation: "Update" });
    expect(pullInvoiceState).toHaveBeenCalledWith("130", null);
    expect(pullPaymentsForInvoice).toHaveBeenCalledWith("130", null);
  });

  it("resolves linked invoices for a Payment event and refreshes them", async () => {
    getPayment.mockResolvedValue({
      Line: [{ LinkedTxn: [{ TxnType: "Invoice", TxnId: "55" }, { TxnType: "Invoice", TxnId: "55" }] }],
    });
    await processEntity({ name: "Payment", id: "900", operation: "Create" });
    expect(getPayment).toHaveBeenCalledWith("900", { actorUserId: null });
    // De-duplicated to a single refresh.
    expect(pullPaymentsForInvoice).toHaveBeenCalledTimes(1);
    expect(pullPaymentsForInvoice).toHaveBeenCalledWith("55", null);
  });
});

describe("processPayload", () => {
  it("collects per-entity errors without aborting the batch", async () => {
    pullInvoiceState.mockRejectedValueOnce(new Error("boom"));
    const out = await processPayload({
      eventNotifications: [{
        dataChangeEvent: {
          entities: [
            { name: "Invoice", id: "1", operation: "Update" },
            { name: "Invoice", id: "2", operation: "Update" },
          ],
        },
      }],
    });
    expect(out.processed).toBe(1);
    expect(out.errors).toHaveLength(1);
    expect(out.errors[0]).toContain("Invoice#1");
  });
});
