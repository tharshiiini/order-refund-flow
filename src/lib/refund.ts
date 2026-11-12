import { toCents } from "./money";
import {
  ApiError,
  PaymentStatus,
  type Addon,
  type Order,
  type OrderLine,
  type OrderUnit,
  type RefundPreview,
  type RefundPreviewLine,
  type RefundSelection,
} from "../types/order";

export type RefundCalcResult =
  | { ok: true; preview: RefundPreview }
  | { ok: false; error: ApiError };

type IndexedUnit = {
  line: OrderLine;
  unit: OrderUnit;
  addonsById: Map<string, Addon>;
};

function indexOrder(order: Order): Map<string, IndexedUnit> {
  const entries = order.items.flatMap((line) =>
    line.units.map((unit): [string, IndexedUnit] => [
      unit.unit_id,
      {
        line,
        unit,
        addonsById: new Map(unit.addons.map((a) => [a.addon_id, a])),
      },
    ]),
  );
  return new Map(entries);
}

export function findUnit(
  order: Order,
  unitId: string,
): { line: OrderLine; unit: OrderUnit } | undefined {
  const entry = indexOrder(order).get(unitId);
  return entry ? { line: entry.line, unit: entry.unit } : undefined;
}

export function isUnitRefundable(unit: OrderUnit): boolean {
  return unit.status === PaymentStatus.Paid;
}

export function isAddonRefundable(unit: OrderUnit, addonId: string): boolean {
  if (unit.status !== PaymentStatus.Paid) return false;
  return unit.addons.some(
    (a) => a.addon_id === addonId && a.status === PaymentStatus.Paid,
  );
}

export function hasRefundableBalance(order: Order): boolean {
  if (
    order.delivery_fee_status === PaymentStatus.Paid &&
    toCents(order.delivery_fee) > 0
  ) {
    return true;
  }
  return order.items.flatMap((line) => line.units).some(isUnitRefundable);
}

export function fullRefundSelection(order: Order): RefundSelection {
  const refundableUnits = order.items
    .flatMap((line) => line.units)
    .filter(isUnitRefundable);

  const unitIds = refundableUnits.map((unit) => unit.unit_id);
  const addons = refundableUnits.flatMap((unit) =>
    unit.addons
      .filter((addon) => addon.status === PaymentStatus.Paid)
      .map((addon) => ({ unitId: unit.unit_id, addonId: addon.addon_id })),
  );

  return {
    unitIds,
    addons,
    refundDeliveryFee: order.delivery_fee_status === PaymentStatus.Paid,
  };
}

export function calculateRefund(
  order: Order,
  selection: RefundSelection,
): RefundCalcResult {
  const uniqueUnitIds = new Set(selection.unitIds);
  const addonsByUnit = groupAddonsByUnit(selection.addons);

  if (
    uniqueUnitIds.size === 0 &&
    addonsByUnit.size === 0 &&
    !selection.refundDeliveryFee
  ) {
    return {
      ok: false,
      error: new ApiError(
        400,
        "empty_refund",
        "Select at least one item or the delivery fee.",
      ),
    };
  }

  const unitIndex = indexOrder(order);
  const lines: RefundPreviewLine[] = [];
  let amountCents = 0;

  for (const unitId of uniqueUnitIds) {
    const found = unitIndex.get(unitId);
    if (!found) {
      return {
        ok: false,
        error: new ApiError(
          400,
          "unknown_unit",
          `Unit ${unitId} is not on this order.`,
        ),
      };
    }
    // This should never happen
    if (!isUnitRefundable(found.unit)) {
      return {
        ok: false,
        error: new ApiError(
          409,
          "already_refunded",
          `${found.line.name} (${unitId}) is already refunded.`,
        ),
      };
    }

    const unitCents = toCents(found.line.unit_price);
    amountCents += unitCents;

    const selectedAddonSet = addonsByUnit.get(unitId) ?? new Set<string>();
    const previewAddons: RefundPreviewLine["addons"] = [];

    for (const addonId of selectedAddonSet) {
      const addon = found.addonsById.get(addonId);
      if (!addon) {
        return {
          ok: false,
          error: new ApiError(
            400,
            "unknown_addon",
            `Add-on ${addonId} is not on ${unitId}.`,
          ),
        };
      }
      if (addon.status !== PaymentStatus.Paid) {
        return {
          ok: false,
          error: new ApiError(
            409,
            "already_refunded",
            `${addon.name} on ${unitId} is already refunded.`,
          ),
        };
      }

      const addonCents = toCents(addon.unit_price);
      amountCents += addonCents;
      previewAddons.push({
        addonId,
        name: addon.name,
        amountCents: addonCents,
      });
    }

    lines.push({
      unitId,
      name: found.line.name,
      amountCents: unitCents,
      addons: previewAddons,
    });
  }

  let deliveryFeeCents = 0;
  if (selection.refundDeliveryFee) {
    if (order.delivery_fee_status !== PaymentStatus.Paid) {
      return {
        ok: false,
        error: new ApiError(
          409,
          "already_refunded",
          "The delivery fee is already refunded.",
        ),
      };
    }
    deliveryFeeCents = toCents(order.delivery_fee);
    amountCents += deliveryFeeCents;
  }

  if (amountCents <= 0) {
    return {
      ok: false,
      error: new ApiError(
        400,
        "empty_refund",
        "Refund amount must be greater than zero.",
      ),
    };
  }

  return {
    ok: true,
    preview: { amountCents, deliveryFeeCents, lines },
  };
}

function groupAddonsByUnit(
  addons: RefundSelection["addons"],
): Map<string, Set<string>> {
  const grouped = new Map<string, Set<string>>();
  for (const { unitId, addonId } of addons) {
    const set = grouped.get(unitId) ?? new Set<string>();
    set.add(addonId);
    grouped.set(unitId, set);
  }
  return grouped;
}

export function applyRefund(order: Order, selection: RefundSelection): Order {
  const unitIds = new Set(selection.unitIds);
  const addonsByUnit = groupAddonsByUnit(selection.addons);

  const refundUnit = (unit: OrderUnit): OrderUnit => {
    if (!unitIds.has(unit.unit_id)) return unit;
    const selectedAddons = addonsByUnit.get(unit.unit_id);

    return {
      ...unit,
      status: PaymentStatus.Refunded,
      addons: selectedAddons
        ? unit.addons.map((a) =>
            selectedAddons.has(a.addon_id)
              ? { ...a, status: PaymentStatus.Refunded }
              : a,
          )
        : unit.addons,
    };
  };

  const nextOrder: Order = {
    ...order,
    delivery_fee_status: selection.refundDeliveryFee
      ? PaymentStatus.Refunded
      : order.delivery_fee_status,
    items: order.items.map((line) => ({
      ...line,
      units: line.units.map(refundUnit),
    })),
  };

  return {
    ...nextOrder,
    status: hasRefundableBalance(nextOrder)
      ? "partially_refunded"
      : PaymentStatus.Refunded,
  };
}
