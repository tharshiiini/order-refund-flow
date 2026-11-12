import { describe, expect, it } from "vitest";
import { SEED_ORDER } from "../data/seedOrder";
import {
  PaymentStatus,
  type Order,
  type RefundSelection,
} from "../types/order";
import { fromCents } from "./money";
import {
  applyRefund,
  calculateRefund,
  fullRefundSelection,
  hasRefundableBalance,
} from "./refund";

const emptySelection: RefundSelection = {
  unitIds: [],
  addons: [],
  refundDeliveryFee: false,
};

describe("calculateRefund", () => {
  it("returns empty_refund error when nothing is selected", () => {
    const result = calculateRefund(SEED_ORDER, emptySelection);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("empty_refund");
  });

  it("sums a single paid unit without add-ons", () => {
    const result = calculateRefund(SEED_ORDER, {
      ...emptySelection,
      unitIds: ["L3-1"],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(fromCents(result.preview.amountCents)).toBe(7.9);
    expect(result.preview.lines).toHaveLength(1);
    expect(result.preview.lines[0]?.name).toBe("Butter Croissant");
  });

  it("includes selected add-ons with their parent unit", () => {
    const result = calculateRefund(SEED_ORDER, {
      unitIds: ["L2-1"],
      addons: [
        { unitId: "L2-1", addonId: "A2" },
        { unitId: "L2-1", addonId: "A3" },
      ],
      refundDeliveryFee: false,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(fromCents(result.preview.amountCents)).toBe(14.4);
  });

  it("allows refunding a drink with a subset of its add-ons", () => {
    const result = calculateRefund(SEED_ORDER, {
      unitIds: ["L2-1"],
      addons: [{ unitId: "L2-1", addonId: "A2" }],
      refundDeliveryFee: false,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.preview.lines[0]?.addons).toHaveLength(1);
    expect(result.preview.lines[0]?.addons[0]?.addonId).toBe("A2");
  });

  it("allows refunding a drink without its add-ons", () => {
    const result = calculateRefund(SEED_ORDER, {
      unitIds: ["L1-2"],
      addons: [],
      refundDeliveryFee: false,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(fromCents(result.preview.amountCents)).toBe(13.9);
  });

  it("rejects an add-on without its parent item", () => {
    const result = calculateRefund(SEED_ORDER, {
      unitIds: [],
      addons: [{ unitId: "L1-2", addonId: "A1" }],
      refundDeliveryFee: false,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("orphan_addon");
  });

  it("rejects units that are already refunded", () => {
    const result = calculateRefund(SEED_ORDER, {
      ...emptySelection,
      unitIds: ["L1-1"],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("already_refunded");
  });

  it("rejects add-ons on a unit that is already refunded", () => {
    const result = calculateRefund(SEED_ORDER, {
      unitIds: ["L2-2"],
      addons: [{ unitId: "L2-2", addonId: "A2" }],
      refundDeliveryFee: false,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("already_refunded");
  });

  it("includes an optional delivery fee", () => {
    const result = calculateRefund(SEED_ORDER, {
      ...emptySelection,
      refundDeliveryFee: true,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(fromCents(result.preview.amountCents)).toBe(5);
    expect(fromCents(result.preview.deliveryFeeCents)).toBe(5);
  });

  it("rejects a delivery fee that is already refunded", () => {
    const order: Order = {
      ...SEED_ORDER,
      delivery_fee_status: PaymentStatus.Refunded,
    };
    const result = calculateRefund(order, {
      ...emptySelection,
      refundDeliveryFee: true,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("already_refunded");
  });

  it("matches a full remaining refund of RM 59.00 on the seed order", () => {
    const result = calculateRefund(SEED_ORDER, fullRefundSelection(SEED_ORDER));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(fromCents(result.preview.amountCents)).toBe(59);
  });

  it("uses cents so 13.90 + 11.90 does not drift", () => {
    const result = calculateRefund(SEED_ORDER, {
      unitIds: ["L1-2", "L2-1"],
      addons: [],
      refundDeliveryFee: false,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.preview.amountCents).toBe(2580);
    expect(fromCents(result.preview.amountCents)).toBe(25.8);
  });

  it("deduplicates repeated unitIds and addon pairs safely", () => {
    const result = calculateRefund(SEED_ORDER, {
      unitIds: ["L3-1", "L3-1"],
      addons: [],
      refundDeliveryFee: false,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.preview.amountCents).toBe(790);
    expect(result.preview.lines).toHaveLength(1);
  });
});

describe("applyRefund", () => {
  it("marks selected units and add-ons as refunded and sets status to partially_refunded", () => {
    const next = applyRefund(SEED_ORDER, {
      unitIds: ["L3-1"],
      addons: [],
      refundDeliveryFee: true,
    });
    expect(next.delivery_fee_status).toBe(PaymentStatus.Refunded);
    expect(next.items[2]?.units[0]?.status).toBe(PaymentStatus.Refunded);
    expect(next.items[2]?.units[1]?.status).toBe(PaymentStatus.Paid);
    expect(next.status).toBe("partially_refunded");
    expect(hasRefundableBalance(next)).toBe(true);
  });

  it("clears remaining refundable balance and sets status to refunded after a full refund", () => {
    const next = applyRefund(SEED_ORDER, fullRefundSelection(SEED_ORDER));
    expect(hasRefundableBalance(next)).toBe(false);
    expect(next.status).toBe(PaymentStatus.Refunded);
  });
});
