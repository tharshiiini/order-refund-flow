export const PaymentStatus = {
  Paid: "paid",
  Refunded: "refunded",
} as const;

export type PaymentStatus = (typeof PaymentStatus)[keyof typeof PaymentStatus];

export const RefundReason = {
  WrongItem: "wrong_item",
  MissingItem: "missing_item",
  QualityIssue: "quality_issue",
  LateDelivery: "late_delivery",
  Other: "other",
} as const;

export type RefundReason = (typeof RefundReason)[keyof typeof RefundReason];

export const REFUND_REASON_LABELS: Record<RefundReason, string> = {
  [RefundReason.WrongItem]: "Wrong item",
  [RefundReason.MissingItem]: "Missing item",
  [RefundReason.QualityIssue]: "Quality issue",
  [RefundReason.LateDelivery]: "Late delivery",
  [RefundReason.Other]: "Other",
};

export const RefundChannel = {
  OriginalPayment: "original_payment",
  InAppCredit: "in_app_credit",
} as const;

export type RefundChannel = (typeof RefundChannel)[keyof typeof RefundChannel];

export const REFUND_CHANNEL_LABELS: Record<RefundChannel, string> = {
  [RefundChannel.OriginalPayment]: "Original payment method",
  [RefundChannel.InAppCredit]: "In-app credit",
};

export type Addon = {
  addon_id: string;
  name: string;
  unit_price: number;
  status: PaymentStatus;
};

export type OrderUnit = {
  unit_id: string;
  status: PaymentStatus;
  addons: Addon[];
};

export type OrderLine = {
  line_id: string;
  name: string;
  unit_price: number;
  units: OrderUnit[];
};

export type Order = {
  order_id: string;
  status: string;
  currency: string;
  delivery_fee: number;
  delivery_fee_status: PaymentStatus;
  items: OrderLine[];
};

export type RefundSelection = {
  unitIds: string[];
  addons: { unitId: string; addonId: string }[];
  refundDeliveryFee: boolean;
};

export type RefundPreviewLine = {
  unitId: string;
  name: string;
  amountCents: number;
  addons: { addonId: string; name: string; amountCents: number }[];
};

export type RefundPreview = {
  amountCents: number;
  deliveryFeeCents: number;
  lines: RefundPreviewLine[];
};

export type CreateRefundRequest = {
  idempotency_key: string;
  items: { unit_id: string; addon_ids: string[] }[];
  refund_delivery_fee: boolean;
  reason: RefundReason;
  channel: RefundChannel;
  client_amount_cents: number;
};

export type Refund = {
  refund_id: string;
  order_id: string;
  amount: number;
  currency: string;
  status: "completed";
  items: CreateRefundRequest["items"];
  refund_delivery_fee: boolean;
  reason: RefundReason;
  channel: RefundChannel;
  created_at: string;
};

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}
