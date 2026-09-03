# Acceptance criteria

- The fixture contains 20 marketplace listings mapped to 10 canonical SKU.
- Re-importing the same page creates no duplicate raw page, sale row, review or alert delivery.
- A renamed product remains attached to the same canonical SKU.
- A partial two-page import with one received page does not advance its watermark or produce a daily report.
- HTTP 429 respects `Retry-After`, uses exponential backoff and stops after five attempts.
- Low stock, out of stock, no sales and low review scenarios are detected from fixtures.
- One alert can be delivered to the same Telegram recipient only once unless explicitly reopened.
- Report totals reconcile to the canonical daily rows and show freshness timestamps.
- No API token, Telegram token, customer PII or production credential reference exists in the repository.
- Every n8n demo workflow remains inactive until credentials, endpoint versions and read scopes are reviewed.

## Portfolio demo

1. Run `npm test`.
2. Run `npm run demo` and show the daily Telegram message.
3. Open `dashboard/index.html` and show marketplace split, top SKU and active alerts.
4. Change one import to `partial`; demonstrate that report generation stops.
5. Run the 429 test and explain bounded retry.
