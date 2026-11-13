# Order Refund Flow

A ZUS Coffee back-office page for issuing partial or full refunds on a completed order. Built with Next.js, TypeScript, Tailwind CSS, and Radix UI. Refunds run against an in-memory mock API, so the demo needs no backend.

**Live demo:** https://order-refund-flow.vercel.app/

---

## Run locally

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). The page loads order `ORD-10482` (MYR).

### Scripts

```bash
npm run dev        # Next.js dev server
npm run lint       # Oxlint
npm test           # Vitest in watch mode
npm run test:run   # Unit tests once
npm run build      # Static export into out/
npm run preview    # Serve the static export
```

`next build` writes a static site to `out/` (`output: 'export'`). Deploy that folder, then replace the live-demo line above with the URL.

## How it works

Staff open **Issue refund**, select paid units and any of those units’ paid add-ons, and can include the delivery fee. **Select all** takes everything still refundable. The next step collects a reason (wrong item, missing item, quality issue, late delivery, or other) and a channel (original payment method or in-app credit). A confirmation dialog shows the total before the request is sent.

Amounts are calculated in cents. A unit can be refunded with all, some, or none of its paid add-ons. An add-on is only refunded together with its unit. Anything already refunded is rejected, and the total must be greater than zero. The header badge follows what is left to refund: paid, partially refunded, or refunded.

The dialog closes immediately and the refund continues in the background. The client sends a fresh idempotency key and the total it calculated. The mock API waits briefly, fails some requests with a retryable `503`, and checks that the client total still matches. Matching retries return the original refund; a reused key with a different payload is rejected. The page retries up to three times with exponential backoff and jitter, then updates the order. Toasts report that the refund is processing, completed, or failed. **Reset demo** restores the seed order.

---

## Notes

### a) API Endpoints

#### `GET /api/orders/:orderId`

Gets the order details, drinks, add-ons, delivery fee, and past refunds.

- **Response (`200 OK`):**
  ```json
  {
    "id": "ORD-10482",
    "currency": "MYR",
    "status": "paid | partially_refunded | refunded",
    "items": [
      {
        "unitId": "L1-1",
        "name": "Iced Spanish Latte",
        "amountCents": 1390,
        "refunded": false,
        "addons": [
          {
            "addonId": "A1",
            "name": "Oat Milk",
            "amountCents": 250,
            "refunded": false
          }
        ]
      }
    ],
    "deliveryFee": { "amountCents": 500, "refunded": false },
    "refunds": []
  }
  ```
- **Errors:** `404 order_not_found`

#### `POST /api/orders/:orderId/refunds`

Sends a new partial or full refund for the selected items.

- **Headers:** `Idempotency-Key: <unique-uuid>` (prevents double refunds if a request is retried)
- **Request Body:**
  ```json
  {
    "unitIds": ["L1-1"],
    "addons": [{ "unitId": "L1-1", "addonId": "A1" }],
    "refundDeliveryFee": false,
    "reason": "wrong_item | missing_item | quality_issue | late_delivery | other",
    "channel": "original_payment | in_app_credit",
    "expectedTotalCents": 1640
  }
  ```
- **Response (`201 Created`, or `200 OK` if retrying the same request):**
  ```json
  {
    "refund": {
      "id": "REF-9012",
      "orderId": "ORD-10482",
      "amountCents": 1640,
      "reason": "wrong_item",
      "channel": "original_payment",
      "createdAt": "2026-11-13T03:30:00Z"
    },
    "order": { "...updated order..." }
  }
  ```
- **Errors:**
  - `400 empty_refund` – nothing was selected
  - `400 already_refunded` – one of the items was already refunded
  - `400 orphan_addon` – an add-on was selected without its main drink
  - `409 total_mismatch` – the screen total did not match the server total
  - `409 idempotency_conflict` – the same key was reused with different items
  - `503 service_unavailable` – temporary server error (safe to retry)

---

### b) Refund Calculation

- **Where should it be calculated?**
  Both on the **frontend** and the **backend**, with the **backend as the final authority**.
  - The **frontend** calculates the total live as staff check boxes so the screen updates instantly.
  - The **backend** calculates the total again using its own saved prices so nobody can tamper with the amount.
- **How do we make sure the amount staff see matches what is refunded?**
  1. **Use whole cents everywhere:** Both sides calculate in cents (`1390` instead of `13.90`) so decimal math never goes off by 1 cent.
  2. **Send `expectedTotalCents`:** The frontend sends the exact total shown to staff in Step 2. Before processing the refund, the backend checks if its own total matches `expectedTotalCents`. If they do not match (for example, if someone else refunded an item at the same time), the backend rejects it with `409 total_mismatch` and reloads the latest order instead of refunding the wrong amount.

---

### c) Assumptions, Questions & Comments for the PM or Designer

- **Assumptions:**
  - Any promo discounts are already included in each drink's paid price, so we do not need to split order-level vouchers across items.
  - The delivery fee is refunded as a whole amount (all or nothing) and can only be refunded once.
  - If a customer ordered 2 of the same drink, each cup is listed separately (`L1-1`, `L1-2`) so staff can refund just 1 cup with its own add-ons.
- **Questions for PM / Designer:**
  - **Delivery fee on "Select all":** Should **Select all** also tick the delivery fee automatically, or leave it unticked unless staff choose it?
  - **Refunding only an add-on:** If a customer got regular milk instead of paid Oat Milk, should staff be allowed to refund _just_ the Oat Milk add-on without refunding the whole drink? (Right now, add-ons require the main drink to be refunded too.)
  - **Two staff editing at once:** If two staff members open the same order at the same time, is a warning message + page refresh enough, or do we need to lock the order while someone is refunding it?

---

### d) Key Decisions & Trade-offs

- **In-memory fake API instead of a real server:** Keeps the live demo fast, free to host, and easy to reset with one click, while still simulating real delays, `503` errors, and duplicate-request checks.
- **Background retries with an idempotency key:** Closing the modal right away lets staff move on to the next customer instead of waiting on a spinner. Retrying `503` errors automatically handles temporary network hiccups, and the `Idempotency-Key` guarantees the customer is never refunded twice for the same click.
- **Prevent mistakes in the UI first:** Clicking an add-on automatically selects its main drink in the UI so staff cannot accidentally create an invalid selection, while the calculation logic still double-checks all rules underneath.
- **Keep money in cents until display:** Only formatting to `RM XX.XX` on screen keeps all math simple, exact, and easy to test with Vitest.

---

### e) Known Limitations & Next Steps

- **No permanent database:** All changes stay in browser memory and reset when you refresh the page or click **Reset demo**. Next step: save orders, refunds, and idempotency keys in a real database (like PostgreSQL).
- **Closing the tab cancels retries:** Because retries run in browser memory, closing the tab while a refund is retrying will stop it. Next step: save pending refunds in browser storage (`localStorage` or IndexedDB) so they finish when the tab is reopened.
- **No staff login or approval limits:** Any user can refund any amount right now. Next step: track which staff member issued each refund and require a manager PIN for large refunds (for example, over RM 50).
- **More automated tests:** Add end-to-end browser tests (with Playwright) to test clicking through the full refund pop-up and recovering from `503` errors.
