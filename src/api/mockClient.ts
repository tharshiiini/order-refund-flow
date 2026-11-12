import { SEED_ORDER } from "../data/seedOrder";
import { applyRefund, calculateRefund } from "../lib/refund";
import { fromCents } from "../lib/money";
import type {
  CreateRefundRequest,
  Order,
  Refund,
  RefundSelection,
} from "../types/order";
import { ApiError } from "../types/order";

const LATENCY_MS = { min: 450, max: 1100 };
const READ_FAILURE_RATE = 0.08;
const WRITE_FAILURE_RATE = 0.18;

type IdempotencyRecord = {
  fingerprint: string;
  response: { refund: Refund; order: Order };
};

let order: Order = structuredClone(SEED_ORDER);
let refundSeq = 1;
const idempotencyStore = new Map<string, IdempotencyRecord>();

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function latency() {
  return LATENCY_MS.min + Math.random() * (LATENCY_MS.max - LATENCY_MS.min);
}

async function simulateNetwork(kind: "read" | "write") {
  await wait(latency());
  const rate = kind === "read" ? READ_FAILURE_RATE : WRITE_FAILURE_RATE;
  if (Math.random() < rate) {
    throw new ApiError(
      503,
      "upstream_unavailable",
      "Refund service timed out. Try again.",
    );
  }
}

function requestToSelection(body: CreateRefundRequest): RefundSelection {
  return {
    unitIds: body.items.map((item) => item.unit_id),
    addons: body.items.flatMap((item) =>
      item.addon_ids.map((addonId) => ({ unitId: item.unit_id, addonId })),
    ),
    refundDeliveryFee: body.refund_delivery_fee,
  };
}

function fingerprintRequest(
  orderId: string,
  body: CreateRefundRequest,
): string {
  const { idempotency_key: _ignored, ...payload } = body;
  return JSON.stringify({ orderId, ...payload });
}

export const mockApi = {
  reset() {
    order = structuredClone(SEED_ORDER);
    refundSeq = 1;
    idempotencyStore.clear();
  },

  async getOrder(orderId: string): Promise<Order> {
    await simulateNetwork("read");
    if (order.order_id !== orderId) {
      throw new ApiError(404, "not_found", `Order ${orderId} was not found.`);
    }
    return structuredClone(order);
  },

  async createRefund(
    orderId: string,
    body: CreateRefundRequest,
  ): Promise<{ refund: Refund; order: Order }> {
    if (!body.idempotency_key?.trim()) {
      throw new ApiError(
        400,
        "missing_idempotency_key",
        "An idempotency_key is required for refund requests.",
      );
    }

    await simulateNetwork("write");

    const fingerprint = fingerprintRequest(orderId, body);
    const existing = idempotencyStore.get(body.idempotency_key);

    if (existing) {
      if (existing.fingerprint !== fingerprint) {
        throw new ApiError(
          409,
          "idempotency_key_reused",
          "Idempotency key was already used with a different refund payload.",
        );
      }
      return structuredClone(existing.response);
    }

    if (order.order_id !== orderId) {
      throw new ApiError(404, "not_found", `Order ${orderId} was not found.`);
    }

    const selection = requestToSelection(body);
    const result = calculateRefund(order, selection);
    if (!result.ok) throw result.error;
    if (body.client_amount_cents !== result.preview.amountCents) {
      throw new ApiError(
        409,
        "amount_mismatch",
        "The refund amount changed. Review the selection and try again.",
      );
    }

    order = applyRefund(order, selection);

    const refund: Refund = {
      refund_id: `RFD-${String(refundSeq).padStart(4, "0")}`,
      order_id: orderId,
      amount: fromCents(result.preview.amountCents),
      currency: order.currency,
      status: "completed",
      items: body.items,
      refund_delivery_fee: body.refund_delivery_fee,
      reason: body.reason,
      channel: body.channel,
      created_at: new Date().toISOString(),
    };
    refundSeq += 1;

    const response = { refund, order: structuredClone(order) };
    idempotencyStore.set(body.idempotency_key, {
      fingerprint,
      response: structuredClone(response),
    });

    return response;
  },
};

export const MOCK_API_BEHAVIOR = {
  latencyMs: LATENCY_MS,
  readFailureRate: READ_FAILURE_RATE,
  writeFailureRate: WRITE_FAILURE_RATE,
};
