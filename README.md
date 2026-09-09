# K2 XP Campaign Prototype — v0.3

Chrome Manifest V3 proof-of-concept for K2 PowerBlock marketing missions.

## No-code Journey Recorder

The admin can record the **entire user journey**, not just a single trigger.

1. Open **Campaign Admin**.
2. Enter a journey/session name and optional starting URL.
3. Click **Start recorder**.
4. Perform the real user flow on the website.
5. The extension records the ordered sequence of page loads, clicks, form submissions, and safe control changes.
6. At the exact point K2 should consider the mission complete, return to Admin and click **Mark Activity Complete**.
7. The sequence is saved under **Recorded Journeys**.
8. Remove any noisy/unnecessary steps.
9. Click **Create campaign**.
10. Set XP and award frequency, then save/enable the campaign.

A journey campaign is monitored as a required ordered sequence. XP is awarded only when the configured steps are observed in order.

### Example

`Visit campaign page -> Click Join -> Submit registration form -> Load success page -> +100 XP`

## Privacy behavior

The recorder does **not** capture passwords, free-text field contents, email/phone field values, or form payloads. It stores action type, page URL/path, CSS selector, short button/link labels, page title, and timestamp.

## Other supported triggers

- Page visit
- Time on page
- Scroll depth
- Button/element click
- Element appears
- Form submission
- Custom K2 completion event
- Recorded journey sequence

## Production architecture

The browser extension should report evidence, not be the XP source of truth:

`Web activity -> Extension / K2 SDK -> K2 API -> validation -> XP ledger -> user account`

The backend should validate identity, campaign eligibility, ordered journey completion, deduplication, rate limits, anti-abuse rules, and award frequency.

## Prototype limitations

Journey matching currently uses ordered action type + normalized URL/path + CSS selector when present. A redesigned third-party website can invalidate selectors. For K2-controlled or partner-integrated pages, explicit signed completion events should eventually be preferred for high-value rewards.
