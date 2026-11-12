"use client";

import { RotateCcw } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { mockApi } from "../../api/mockClient";
import { formatMoney, toCents } from "../../lib/money";
import { hasRefundableBalance } from "../../lib/refund";
import {
  startBackgroundRefund,
  RefundJobStatus,
} from "../../lib/refundProcessor";
import {
  ApiError,
  PaymentStatus,
  type CreateRefundRequest,
  type Order,
} from "../../types/order";
import { Button } from "../ui/Button";
import { Toast, ToastViewport } from "../ui/Toast";
import { StatusBadge } from "../StatusBadge";
import { RefundModal } from "../refund/RefundModal";

type LoadState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; order: Order };

type ToastMessage = {
  title: string;
  content: string;
};

export function OrderPage({ orderId }: { orderId: string }) {
  const [load, setLoad] = useState<LoadState>({ status: "loading" });
  const [toast, setToast] = useState<ToastMessage | null>(null);
  const [refundJob, setRefundJob] = useState<RefundJobStatus | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const activeAbortRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    let cancelled = false;
    void mockApi
      .getOrder(orderId)
      .then((order) => {
        if (!cancelled) setLoad({ status: "ready", order });
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setLoad({
            status: "error",
            message:
              error instanceof ApiError
                ? error.message
                : "Could not load this order.",
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [orderId, reloadKey]);

  useEffect(() => {
    return () => {
      activeAbortRef.current?.();
    };
  }, []);

  if (load.status === "loading") {
    return (
      <div className="mx-auto max-w-4xl px-4 py-16 text-sm text-muted">
        Loading order…
      </div>
    );
  }

  if (load.status === "error") {
    return (
      <div className="mx-auto max-w-md px-4 py-16 text-center">
        <p className="font-medium text-ink">Order could not be loaded</p>
        <p className="mt-2 text-sm text-muted">{load.message}</p>
        <Button
          className="mt-6"
          onClick={() => {
            setLoad({ status: "loading" });
            setReloadKey((key) => key + 1);
          }}
        >
          Retry
        </Button>
      </div>
    );
  }

  const { order } = load;
  const canRefund = hasRefundableBalance(order);
  const isRefunding =
    refundJob?.state === "submitting" || refundJob?.state === "retrying";

  const handleStartRefund = (payload: CreateRefundRequest) => {
    activeAbortRef.current?.();

    const { abort } = startBackgroundRefund(order.order_id, payload, {
      maxAttempts: 3,
      baseDelayMs: 400,
      maxJitterMs: 500,
      onStatusChange: (status: RefundJobStatus) => {
        setRefundJob(status);

        if (status.state === "submitting" && status.attempt === 1) {
          setToast({
            title: "Processing refund…",
            content: `Submitting request (${status.idempotencyKey.slice(0, 22)}…)`,
          });
        }
        //  else if (status.state === "retrying") {
        //   setToast({
        //     title: "Temporary delay — retrying",
        //     content: `Attempt ${status.attempt + 1} of ${status.maxAttempts} in ${status.delayMs}ms…`,
        //   });
        // }
        else if (status.state === "succeeded") {
          setLoad({ status: "ready", order: status.order });
          setToast({
            title: "Refund completed",
            content: `Refund ${status.refund.refund_id} processed successfully.`,
          });
        } else if (status.state === "failed") {
          setToast({
            title: "Refund failed",
            content: status.error.message,
          });
        }
      },
    });

    activeAbortRef.current = abort;
  };
  const hasAnyRefund =
    order.delivery_fee_status === PaymentStatus.Refunded ||
    order.items.some((line) =>
      line.units.some(
        (u) =>
          u.status === PaymentStatus.Refunded ||
          u.addons.some((a) => a.status === PaymentStatus.Refunded),
      ),
    );

  const paymentSummaryStatus = !canRefund
    ? "refunded"
    : hasAnyRefund
      ? "partially_refunded"
      : "paid";
  return (
    <>
      <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted">
              Orders
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-3">
              <h1 className="font-serif text-3xl text-ink">{order.order_id}</h1>
              {/* <StatusBadge status={order.status} /> */}
              <StatusBadge status={paymentSummaryStatus} />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              className="text-muted"
              onClick={() => {
                activeAbortRef.current?.();
                mockApi.reset();
                setRefundJob(null);
                setToast(null);
                setLoad({ status: "loading" });
                setReloadKey((key) => key + 1);
              }}
            >
              <RotateCcw className="size-4" />
              Reset demo
            </Button>
            <RefundModal
              order={order}
              disabled={!canRefund || isRefunding}
              onStartRefund={handleStartRefund}
            />
          </div>
        </div>

        {!canRefund && (
          <div className="mt-5 rounded-lg border border-line bg-white px-4 py-3 text-sm text-muted">
            This order has nothing left to refund.
          </div>
        )}

        <section className="mt-6 overflow-hidden rounded-2xl border border-line bg-white">
          <header className="border-b border-line px-5 py-4">
            <h2 className="text-sm font-semibold text-ink">Items</h2>
          </header>
          <ul>
            {order.items.map((line) =>
              line.units.map((unit) => {
                const unitCents = toCents(line.unit_price);
                return (
                  <li
                    key={unit.unit_id}
                    className="border-b border-line px-5 py-4 last:border-b-0"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex flex-row items-end gap-2">
                        <p className="font-medium text-ink">{line.name}</p>
                        <StatusBadge status={unit.status} />
                      </div>
                      <div className="flex flex-row items-end gap-1">
                        <p className="text-sm tabular-nums text-ink">
                          {formatMoney(unitCents, order.currency)}
                        </p>
                      </div>
                    </div>
                    {unit.addons.length > 0 && (
                      <ul className="mt-3 space-y-1.5 border-l border-line pl-4">
                        {unit.addons.map((addon) => (
                          <li
                            key={`${unit.unit_id}-${addon.addon_id}`}
                            className="flex items-center justify-between gap-3 text-sm"
                          >
                            <span className="text-muted">{addon.name}</span>
                            <span className="flex items-center gap-2">
                              <span className="tabular-nums text-ink">
                                {formatMoney(
                                  toCents(addon.unit_price),
                                  order.currency,
                                )}
                              </span>
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </li>
                );
              }),
            )}
          </ul>
          <div className="flex items-center justify-between border-t border-line bg-soft px-5 py-4">
            <div>
              <p className="text-sm font-medium text-ink">Delivery fee</p>
            </div>
            <div className="flex items-center gap-2">
              <p className="text-sm tabular-nums text-ink">
                {formatMoney(toCents(order.delivery_fee), order.currency)}
              </p>
            </div>
          </div>
        </section>
      </div>

      <Toast
        open={Boolean(toast)}
        onOpenChange={(open) => {
          if (!open) setToast(null);
        }}
        title={toast?.title}
        content={toast?.content ?? ""}
      />
      <ToastViewport />
    </>
  );
}
