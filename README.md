# K2 XP Campaign Prototype

Chrome Manifest V3 proof-of-concept for K2 PowerBlock marketing missions.

## K2 Action Recorder

A marketer/admin can discover completion triggers by performing the real action.

Workflow:

1. Open **Campaign Admin**.
2. In **K2 Action Recorder**, enter a session name.
3. Optionally enter the target website URL.
4. Click **Start recorder**.
5. Browse the website and perform the real action: click a button/link, submit a form, change a checkbox/select control, or navigate to the resulting success/thank-you page.
6. A small **K2 ACTION RECORDER** badge appears on pages while recording.
7. Return to Campaign Admin and click **Stop**.
8. Review **Recorded trigger candidates**.
9. Click **Use as campaign trigger** to prefill a new XP campaign rule.

The recorder captures action type, current page URL, page title, generated CSS selector, short element/button/link label, destination link when applicable, and timestamp. It deliberately does **not** record passwords, text-field values, email/phone input values, or form field contents.

## XP completion triggers

- Page visit
- Time on page
- Scroll depth
- Button / element click
- Element appears
- Form submission
- Custom K2 completion event

## Custom activity event

```js
window.postMessage({
  type: "K2_ACTIVITY_COMPLETE",
  activityId: "learn-about-k2"
}, "*");
```

## Install

1. Clone or download this repository.
2. Open `chrome://extensions` in Chrome.
3. Enable **Developer mode**.
4. Choose **Load unpacked** and select the repository folder.

## Production architecture

Do not trust browser-local XP as the source of truth.

`Web activity -> Extension / K2 SDK -> K2 API -> validation -> XP ledger -> user account`

The backend should validate identity, campaign eligibility, deduplication, rate limits, anti-abuse rules and award frequency.

## Recorder limitations

The recorder captures candidate triggers, not a semantic guarantee that an action truly means completion. For production, an admin should verify the selected selector/URL because website redesigns can change selectors.

For K2-controlled pages, prefer the explicit custom K2 completion event. It is substantially more stable than scraping a site's DOM.

## Next planned enhancement

Turn recorded events into an ordered **Journey / Mission Builder** so an admin can record an entire sequence, mark the completion point, remove unnecessary steps, and create a campaign from the journey.
