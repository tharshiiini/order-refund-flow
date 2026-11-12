import { mockApi } from "../api/mockClient";
import {
  ApiError,
  type CreateRefundRequest,
  type Order,
  type Refund,
} from "../types/order";

export type RetryOptions = {
  maxAttempts?: number;
  baseDelayMs?: number;
  maxJitterMs?: number;
  signal?: AbortSignal;
  onStatusChange?: (status: RefundJobStatus) => void;
};

export type RefundJobStatus =
  | {
      state: "submitting";
      attempt: number;
      maxAttempts: number;
      idempotencyKey: string;
    }
  | {
      state: "retrying";
      attempt: number;
      maxAttempts: number;
      delayMs: number;
      idempotencyKey: string;
    }
  | {
      state: "succeeded";
      refund: Refund;
      order: Order;
      idempotencyKey: string;
    }
  | {
      state: "failed";
      error: ApiError;
      idempotencyKey: string;
    };

export function createIdempotencyKey(orderId: string): string {
  const randomPart =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  return `refund_${orderId}_${randomPart}`;
}

function isRetryableError(error: unknown): boolean {
  if (error instanceof ApiError) {
    return error.status >= 500 || error.status === 429;
  }
  return true;
}

function computeBackoffWithJitter(
  attempt: number,
  baseDelayMs: number,
  maxJitterMs: number,
): number {
  const exponential = baseDelayMs * Math.pow(2, attempt - 1);
  const jitter = Math.floor(Math.random() * (maxJitterMs + 1));
  return exponential + jitter;
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException("Aborted", "AbortError"));
      return;
    }
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        reject(new DOMException("Aborted", "AbortError"));
      },
      { once: true },
    );
  });
}

export async function executeRefundWithRetry(
  orderId: string,
  payload: Omit<CreateRefundRequest, "idempotency_key"> & {
    idempotency_key?: string;
  },
  options: RetryOptions = {},
): Promise<{ refund: Refund; order: Order }> {
  const maxAttempts = options.maxAttempts ?? 4;
  const baseDelayMs = options.baseDelayMs ?? 400;
  const maxJitterMs = options.maxJitterMs ?? 500;
  const idempotencyKey =
    payload.idempotency_key ?? createIdempotencyKey(orderId);

  const requestBody: CreateRefundRequest = {
    ...payload,
    idempotency_key: idempotencyKey,
  };

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    options.onStatusChange?.({
      state: "submitting",
      attempt,
      maxAttempts,
      idempotencyKey,
    });

    try {
      const result = await mockApi.createRefund(orderId, requestBody);
      options.onStatusChange?.({
        state: "succeeded",
        refund: result.refund,
        order: result.order,
        idempotencyKey,
      });
      return result;
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        throw err;
      }

      const apiError =
        err instanceof ApiError
          ? err
          : new ApiError(
              500,
              "unexpected_error",
              "Unexpected error while processing refund.",
            );

      const canRetry = attempt < maxAttempts && isRetryableError(apiError);
      if (!canRetry) {
        options.onStatusChange?.({
          state: "failed",
          error: apiError,
          idempotencyKey,
        });
        throw apiError;
      }

      const delayMs = computeBackoffWithJitter(
        attempt,
        baseDelayMs,
        maxJitterMs,
      );
      options.onStatusChange?.({
        state: "retrying",
        attempt,
        maxAttempts,
        delayMs,
        idempotencyKey,
      });

      await sleep(delayMs, options.signal);
    }
  }

  throw new ApiError(
    503,
    "retries_exhausted",
    "Refund failed after maximum retries.",
  );
}

export function startBackgroundRefund(
  orderId: string,
  payload: Omit<CreateRefundRequest, "idempotency_key"> & {
    idempotency_key?: string;
  },
  options: RetryOptions = {},
): { idempotencyKey: string; abort: () => void } {
  const controller = new AbortController();
  const idempotencyKey =
    payload.idempotency_key ?? createIdempotencyKey(orderId);

  void executeRefundWithRetry(
    orderId,
    { ...payload, idempotency_key: idempotencyKey },
    { ...options, signal: controller.signal },
  ).catch(() => {
    // Handled via onStatusChange({ state: 'failed' })
  });

  return {
    idempotencyKey,
    abort: () => controller.abort(),
  };
}
