"use client";

import { useMemo, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import {
  calculateRefund,
  fullRefundSelection,
  isUnitRefundable,
} from "../../lib/refund";
import { formatMoney, toCents } from "../../lib/money";
import { createIdempotencyKey } from "../../lib/refundProcessor";
import {
  PaymentStatus,
  RefundChannel,
  RefundReason,
  REFUND_CHANNEL_LABELS,
  REFUND_REASON_LABELS,
  type CreateRefundRequest,
  type Order,
  type RefundSelection,
} from "../../types/order";
import { Button } from "../ui/Button";

type RefundModalProps = {
  order: Order;
  disabled?: boolean;
  onStartRefund: (payload: CreateRefundRequest) => void;
};

export function RefundModal({
  order,
  disabled,
  onStartRefund,
}: RefundModalProps) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<"select" | "review">("select");
  const [confirmOpen, setConfirmOpen] = useState(false);

  const [selection, setSelection] = useState<RefundSelection>({
    unitIds: [],
    addons: [],
    refundDeliveryFee: false,
  });
  const [reason, setReason] = useState<RefundReason>(RefundReason.WrongItem);
  const [channel, setChannel] = useState<RefundChannel>(
    RefundChannel.OriginalPayment,
  );
  const [idempotencyKey, setIdempotencyKey] = useState<string>(() =>
    createIdempotencyKey(order.order_id),
  );

  const calc = useMemo(
    () => calculateRefund(order, selection),
    [order, selection],
  );

  const resetModal = () => {
    setStep("select");
    setConfirmOpen(false);
    setSelection({ unitIds: [], addons: [], refundDeliveryFee: false });
    setReason(RefundReason.WrongItem);
    setChannel(RefundChannel.OriginalPayment);
    setIdempotencyKey(createIdempotencyKey(order.order_id));
  };

  const handleOpenChange = (nextOpen: boolean) => {
    setOpen(nextOpen);
    if (nextOpen) resetModal();
  };

  const toggleUnit = (unitId: string, checked: boolean) => {
    setSelection((prev) => {
      if (checked) {
        const unit = order.items
          .flatMap((l) => l.units)
          .find((u) => u.unit_id === unitId);
        const paidAddons = (unit?.addons ?? [])
          .filter((a) => a.status === PaymentStatus.Paid)
          .map((a) => ({ unitId, addonId: a.addon_id }));

        return {
          ...prev,
          unitIds: [...new Set([...prev.unitIds, unitId])],
          addons: [
            ...prev.addons.filter((a) => a.unitId !== unitId),
            ...paidAddons,
          ],
        };
      }

      return {
        ...prev,
        unitIds: prev.unitIds.filter((id) => id !== unitId),
        addons: prev.addons.filter((a) => a.unitId !== unitId),
      };
    });
  };

  const toggleAddon = (unitId: string, addonId: string, checked: boolean) => {
    setSelection((prev) => {
      if (checked) {
        return {
          ...prev,
          unitIds: [...new Set([...prev.unitIds, unitId])],
          addons: [
            ...prev.addons.filter(
              (a) => !(a.unitId === unitId && a.addonId === addonId),
            ),
            { unitId, addonId },
          ],
        };
      }

      return {
        ...prev,
        addons: prev.addons.filter(
          (a) => !(a.unitId === unitId && a.addonId === addonId),
        ),
      };
    });
  };

  const handleNextStep = () => {
    setIdempotencyKey(createIdempotencyKey(order.order_id));
    setStep("review");
  };

  const handleConfirmRefund = () => {
    if (!calc.ok) return;

    const itemsMap = new Map<string, string[]>();
    for (const unitId of selection.unitIds) {
      itemsMap.set(unitId, []);
    }
    for (const { unitId, addonId } of selection.addons) {
      itemsMap.get(unitId)?.push(addonId);
    }

    const payload: CreateRefundRequest = {
      idempotency_key: idempotencyKey,
      items: Array.from(itemsMap.entries()).map(([unit_id, addon_ids]) => ({
        unit_id,
        addon_ids,
      })),
      refund_delivery_fee: selection.refundDeliveryFee,
      reason,
      channel,
      client_amount_cents: calc.preview.amountCents,
    };

    setConfirmOpen(false);
    setOpen(false);
    onStartRefund(payload);
  };

  const isUnitChecked = (unitId: string) => selection.unitIds.includes(unitId);
  const isAddonChecked = (unitId: string, addonId: string) =>
    selection.addons.some((a) => a.unitId === unitId && a.addonId === addonId);

  const hasDeliveryFee =
    order.delivery_fee_status === PaymentStatus.Paid &&
    toCents(order.delivery_fee) > 0;

  return (
    <>
      <Dialog.Root open={open} onOpenChange={handleOpenChange}>
        <Dialog.Trigger asChild>
          <Button disabled={disabled}>Issue refund</Button>
        </Dialog.Trigger>

        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-40 bg-black/40" />
          <Dialog.Content className="fixed left-1/2 top-1/2 z-50 flex max-h-[85dvh] w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-2xl bg-white shadow-xl">
            {/* Fixed Header */}
            <div className="flex shrink-0 items-center justify-between border-b border-line bg-white px-6 py-4">
              <Dialog.Title className="text-lg font-semibold text-ink">
                {step === "select"
                  ? "Select items to refund"
                  : "Review & details"}
              </Dialog.Title>
              {step === "select" && (
                <button
                  type="button"
                  onClick={() => setSelection(fullRefundSelection(order))}
                  className="text-xs font-medium text-brand hover:underline"
                >
                  Select all
                </button>
              )}
            </div>

            {/* Scrollable Body (Only this region scrolls) */}
            <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
              {step === "select" ? (
                <div className="space-y-3">
                  {order.items.flatMap((line) =>
                    line.units.map((unit) => {
                      const refundable = isUnitRefundable(unit);
                      return (
                        <div
                          key={unit.unit_id}
                          className="rounded-xl border border-line p-3"
                        >
                          <label className="flex items-center justify-between gap-3">
                            <span className="flex items-center gap-2.5">
                              <input
                                type="checkbox"
                                disabled={!refundable}
                                checked={isUnitChecked(unit.unit_id)}
                                onChange={(e) =>
                                  toggleUnit(unit.unit_id, e.target.checked)
                                }
                              />
                              <span
                                className={
                                  refundable
                                    ? "text-ink"
                                    : "text-muted line-through"
                                }
                              >
                                {line.name}
                              </span>
                            </span>
                            <span className="text-sm tabular-nums text-ink">
                              {formatMoney(
                                toCents(line.unit_price),
                                order.currency,
                              )}
                            </span>
                          </label>

                          {unit.addons.length > 0 && (
                            <div className="mt-2 space-y-1.5 border-l border-line pl-6">
                              {unit.addons.map((addon) => {
                                const addonRefundable =
                                  refundable &&
                                  addon.status === PaymentStatus.Paid;
                                return (
                                  <label
                                    key={addon.addon_id}
                                    className="flex items-center justify-between text-sm"
                                  >
                                    <span className="flex items-center gap-2">
                                      <input
                                        type="checkbox"
                                        disabled={!addonRefundable}
                                        checked={isAddonChecked(
                                          unit.unit_id,
                                          addon.addon_id,
                                        )}
                                        onChange={(e) =>
                                          toggleAddon(
                                            unit.unit_id,
                                            addon.addon_id,
                                            e.target.checked,
                                          )
                                        }
                                      />
                                      <span
                                        className={
                                          addonRefundable
                                            ? "text-muted"
                                            : "text-muted/50 line-through"
                                        }
                                      >
                                        {addon.name}
                                      </span>
                                    </span>
                                    <span className="tabular-nums text-ink">
                                      {formatMoney(
                                        toCents(addon.unit_price),
                                        order.currency,
                                      )}
                                    </span>
                                  </label>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      );
                    }),
                  )}

                  {hasDeliveryFee && (
                    <label className="flex items-center justify-between rounded-xl border border-line bg-soft p-3">
                      <span className="flex items-center gap-2.5">
                        <input
                          type="checkbox"
                          checked={selection.refundDeliveryFee}
                          onChange={(e) =>
                            setSelection((prev) => ({
                              ...prev,
                              refundDeliveryFee: e.target.checked,
                            }))
                          }
                        />
                        <span className="text-sm font-medium text-ink">
                          Delivery fee
                        </span>
                      </span>
                      <span className="text-sm tabular-nums text-ink">
                        {formatMoney(
                          toCents(order.delivery_fee),
                          order.currency,
                        )}
                      </span>
                    </label>
                  )}
                </div>
              ) : (
                <div className="space-y-4">
                  {calc.ok && (
                    <div className="space-y-2 rounded-xl border border-line bg-soft p-4 text-sm">
                      {calc.preview.lines.map((line) => (
                        <div key={line.unitId}>
                          <div className="flex justify-between font-medium text-ink">
                            <span>{line.name}</span>
                            <span>
                              {formatMoney(line.amountCents, order.currency)}
                            </span>
                          </div>
                          {line.addons.map((addon) => (
                            <div
                              key={addon.addonId}
                              className="flex justify-between pl-4 text-xs text-muted"
                            >
                              <span>+ {addon.name}</span>
                              <span>
                                {formatMoney(addon.amountCents, order.currency)}
                              </span>
                            </div>
                          ))}
                        </div>
                      ))}
                      {calc.preview.deliveryFeeCents > 0 && (
                        <div className="flex justify-between text-ink">
                          <span>Delivery fee</span>
                          <span>
                            {formatMoney(
                              calc.preview.deliveryFeeCents,
                              order.currency,
                            )}
                          </span>
                        </div>
                      )}
                    </div>
                  )}

                  <div>
                    <label
                      htmlFor="refund-reason"
                      className="block text-sm font-medium text-ink"
                    >
                      Reason
                    </label>
                    <select
                      id="refund-reason"
                      value={reason}
                      onChange={(e) =>
                        setReason(e.target.value as RefundReason)
                      }
                      className="mt-1 w-full rounded-lg border border-line bg-white px-3 py-2 text-sm text-ink"
                    >
                      {Object.values(RefundReason).map((value) => (
                        <option key={value} value={value}>
                          {REFUND_REASON_LABELS[value]}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <span className="block text-sm font-medium text-ink">
                      Channel
                    </span>
                    <div className="mt-1.5 grid grid-cols-2 gap-2">
                      {Object.values(RefundChannel).map((value) => (
                        <label
                          key={value}
                          className={`flex cursor-pointer items-center gap-2 rounded-lg border p-2.5 text-sm ${
                            channel === value
                              ? "border-brand bg-soft font-medium text-brand"
                              : "border-line text-ink"
                          }`}
                        >
                          <input
                            type="radio"
                            name="refund-channel"
                            value={value}
                            checked={channel === value}
                            onChange={() => setChannel(value)}
                          />
                          <span>{REFUND_CHANNEL_LABELS[value]}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Fixed Footer (Total + Buttons always pinned at bottom) */}
            <div className="flex shrink-0 items-center justify-between border-t border-line bg-white px-6 py-4">
              <div>
                <p className="text-xs text-muted">
                  {step === "select" ? "Total refund" : "Final refund amount"}
                </p>
                <p className="text-lg font-semibold tabular-nums text-ink">
                  {formatMoney(
                    calc.ok ? calc.preview.amountCents : 0,
                    order.currency,
                  )}
                </p>
              </div>
              <div className="flex gap-2">
                {step === "select" ? (
                  <>
                    <Button variant="ghost" onClick={() => setOpen(false)}>
                      Cancel
                    </Button>
                    <Button disabled={!calc.ok} onClick={handleNextStep}>
                      Next
                    </Button>
                  </>
                ) : (
                  <>
                    <Button variant="ghost" onClick={() => setStep("select")}>
                      Back
                    </Button>
                    <Button onClick={() => setConfirmOpen(true)}>
                      Confirm
                    </Button>
                  </>
                )}
              </div>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      {/* Step 3: Confirmation Dialog */}
      <Dialog.Root open={confirmOpen} onOpenChange={setConfirmOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-50 bg-black/50" />
          <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[calc(100%-2rem)] max-w-sm -translate-x-1/2 -translate-y-1/2 rounded-2xl bg-white p-6 shadow-2xl">
            <Dialog.Title className="text-base font-semibold text-ink">
              Confirm refund?
            </Dialog.Title>
            <Dialog.Description className="mt-2 text-sm text-muted">
              This will refund{" "}
              <span className="font-medium text-ink">
                {formatMoney(
                  calc.ok ? calc.preview.amountCents : 0,
                  order.currency,
                )}
              </span>{" "}
              via{" "}
              <span className="font-medium text-ink">
                {REFUND_CHANNEL_LABELS[channel]}
              </span>
              .
            </Dialog.Description>
            <div className="mt-6 flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setConfirmOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleConfirmRefund}>Confirm refund</Button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  );
}
