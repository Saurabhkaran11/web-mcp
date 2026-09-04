# Local Loop — Shopify-backed WebMCP commerce demo

Local Loop is a Next.js storefront where a shopper and their browser agent work from the same Shopify cart. WebMCP tools search the current catalog and update the visible cart immediately; checkout is always a human-controlled handoff to Shopify Checkout.

## What it demonstrates

- Discoverable browser-native WebMCP tools with Zod input contracts
- Live Shopify product, variant, price, and inventory data
- Shared human and agent state through a Shopify cart held in an HTTP-only session cookie
- Explicit confirmation before checkout, followed by a Shopify Checkout link
- A curated local fallback catalog while Shopify is not configured

## Configure Shopify

Copy `.env.example` to `.env.local`, then fill in your own values:

```env
SHOPIFY_STORE_DOMAIN=your-store.myshopify.com
SHOPIFY_STOREFRONT_PRIVATE_ACCESS_TOKEN=your-private-token
SHOPIFY_STOREFRONT_API_VERSION=2026-07
```

Keep `.env.local` private. The application sends the private token only from server-side route handlers; it is never sent to the browser or exposed to WebMCP tools.

## Run locally

```bash
npm install
npm run dev
```

Open `http://localhost:3000` in the ChatGPT in-app browser, or Chrome 149+ with `chrome://flags/#enable-webmcp-testing` enabled.

## WebMCP tools

| Tool | Kind | Purpose |
| --- | --- | --- |
| `search_inventory` | Read | Find catalog items by words, category, price, and stock state. |
| `add_to_cart` | Write | Add an in-stock item to the shared cart. |
| `get_cart` | Read | Return cart lines and the total. |
| `remove_from_cart` | Write | Reduce or remove a cart line. |
| `fulfill_shopping_list` | Write | Find budget-aware matches for a list and add them to the cart. |
| `checkout` | Write | Return a Shopify Checkout link; requires `confirm: true`. |
| `get_order_status` | Read | Direct the shopper to secure Shopify order history after checkout. |

Try: **“Find beauty under $25, add one option to my cart, show the cart, then prepare checkout.”**

## Verification checklist

1. Run `npm run build`.
2. Open the deployed site in the ChatGPT in-app browser or WebMCP-enabled Chrome.
3. Confirm all seven tools appear in the browser's WebMCP inspector.
4. Test Shopify product search, a stock-limit error, cart persistence after refresh, explicit checkout confirmation, and the checkout redirect.
5. Open the public repository in an incognito window and verify the MIT license is visible.

## Deploy

This is a standard Next.js App Router application. Deploy it to Cloudflare, Vercel, Netlify, Render, or another Node-compatible host. Configure the three Shopify environment variables in the deployment provider's secret settings; never commit `.env.local`.

## Deliberate boundaries

Local Loop uses a real Shopify cart but is still a portfolio demo. A production merchant version would add authenticated customer sessions, inventory-reservation rules, Shopify webhooks for push updates, audit logs, a privacy policy, and merchant approval before accepting transactions.
