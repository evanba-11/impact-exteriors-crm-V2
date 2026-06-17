import { describe, it, expect, vi, beforeEach } from "vitest";
import { QboApiError } from "./client";

// Stub the dispatch targets + storage so runSyncQueue can be driven deterministically.
const upsertCustomerForOpportunity = vi.fn().mockResolvedValue({ qboCustomerId: "1", created: false });
const pushEstimate = vi.fn().mockResolvedValue({});
const pullInvoiceState = vi.fn().mockResolvedValue({});
const pullPaymentsForInvoice = vi.fn().mockResolvedValue({});

vi.mock("./customers", () => ({ upsertCustomerForOpportunity: (...a: any[]) => upsertCustomerForOpportunity(...a) }));
vi.mock("./estimates", () => ({ pushEstimate: (...a: any[]) => pushEstimate(...a) }));
vi.mock("./invoices", () => ({ pullInvoiceState: (...a: any[]) => pullInvoiceState(...a) }));
vi.mock("./payments", () => ({ pullPaymentsForInvoice: (...a: any[]) => pullPaymentsForInvoice(...a) }));

const dueSyncQueue = vi.fn();
const updateSyncQueue = vi.fn();
const getJob = vi.fn();
vi.mock("../../storage", () => ({
  storage: {
    dueSyncQueue: (...a: any[]) => dueSyncQueue(...a),
    updateSyncQueue: (...a: any[]) => updateSyncQueue(...a),
    getJob: (...a: any[]) => getJob(...a),
  },
}));

import { BACKOFF_MS, nextAttemptAt, shouldFail, runSyncQueue } from "./queue";

beforeEach(() => {
  dueSyncQueue.mockReset();
  updateSyncQueue.mockReset();
  getJob.mockReset();
  upsertCustomerForOpportunity.mockClear();
  pullInvoiceState.mockClear();
});

describe("nextAttemptAt", () => {
  it("follows the 1m,5m,30m,2h,12h schedule and clamps to the last step", () => {
    const t0 = 1_000_000;
    expect(nextAttemptAt(1, t0)).toBe(t0 + BACKOFF_MS[0]);
    expect(nextAttemptAt(2, t0)).toBe(t0 + BACKOFF_MS[1]);
    expect(nextAttemptAt(5, t0)).toBe(t0 + BACKOFF_MS[4]);
    // Beyond the table, clamp to the final (12h) step.
    expect(nextAttemptAt(99, t0)).toBe(t0 + BACKOFF_MS[BACKOFF_MS.length - 1]);
  });
});

describe("shouldFail", () => {
  it("fails immediately on a permanent 4xx API error", () => {
    expect(shouldFail(1, new QboApiError(400, "bad request"))).toBe(true);
  });
  it("does NOT fail immediately on a 409 conflict (retryable)", () => {
    expect(shouldFail(1, new QboApiError(409, "stale SyncToken"))).toBe(false);
  });
  it("does NOT fail immediately on transient 429/5xx", () => {
    expect(shouldFail(1, new QboApiError(429, "rate limit"))).toBe(false);
    expect(shouldFail(2, new QboApiError(503, "unavailable"))).toBe(false);
  });
  it("fails once the backoff schedule is exhausted", () => {
    expect(shouldFail(BACKOFF_MS.length, new Error("net"))).toBe(false);
    expect(shouldFail(BACKOFF_MS.length + 1, new Error("net"))).toBe(true);
  });
});

describe("runSyncQueue", () => {
  it("marks a successful row success", async () => {
    dueSyncQueue.mockReturnValue([{ id: 1, entityType: "customer", entityId: "7", direction: "push", attempts: 0 }]);
    const out = await runSyncQueue();
    expect(upsertCustomerForOpportunity).toHaveBeenCalledWith(7, null);
    expect(out).toEqual({ ok: 1, retried: 0, failed: 0 });
    expect(updateSyncQueue).toHaveBeenLastCalledWith(1, { status: "success", lastError: null });
  });

  it("reschedules a transient failure with backoff", async () => {
    dueSyncQueue.mockReturnValue([{ id: 2, entityType: "invoice", entityId: "9", direction: "pull", attempts: 0 }]);
    pullInvoiceState.mockRejectedValueOnce(new QboApiError(503, "down"));
    const out = await runSyncQueue();
    expect(out).toEqual({ ok: 0, retried: 1, failed: 0 });
    const call = updateSyncQueue.mock.calls.find((c) => c[1].status === "pending");
    expect(call![1]).toMatchObject({ status: "pending", attempts: 1 });
    expect(call![1].nextAttemptAt).toBeGreaterThan(Date.now());
  });

  it("permanently fails a non-transient error", async () => {
    dueSyncQueue.mockReturnValue([{ id: 3, entityType: "invoice", entityId: "9", direction: "pull", attempts: 0 }]);
    pullInvoiceState.mockRejectedValueOnce(new QboApiError(400, "bad"));
    const out = await runSyncQueue();
    expect(out).toEqual({ ok: 0, retried: 0, failed: 1 });
    const call = updateSyncQueue.mock.calls.find((c) => c[1].status === "failed");
    expect(call![1]).toMatchObject({ status: "failed", attempts: 1 });
  });

  it("resyncs an opportunity end-to-end (customer + invoice when present)", async () => {
    dueSyncQueue.mockReturnValue([{ id: 4, entityType: "opportunity", entityId: "5", direction: "push", attempts: 0 }]);
    getJob.mockReturnValue({ id: 5, qboInvoiceId: "INV1" });
    await runSyncQueue();
    expect(upsertCustomerForOpportunity).toHaveBeenCalledWith(5, null);
    expect(pullInvoiceState).toHaveBeenCalledWith("INV1", null);
  });
});
