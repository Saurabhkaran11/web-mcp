# Local Loop

**A live Shopify shop that people and browser agents can use together.**

[Open the live demo](https://web-mcp-mu.vercel.app/)

Local Loop makes online shopping simpler. Instead of clicking through filters and product pages, a browser agent can search the shop, add items to the same cart you see, and prepare Shopify Checkout. You stay in control of every purchase.

> **Demo video:** [▶ Watch the 90-second Local Loop demo on YouTube](https://youtu.be/ER8LuhkWXhM)

## What you can do

- Browse real products, prices, and available stock from Shopify.
- Ask an agent to find an item within a budget.
- Let the agent add items to the same cart shown on screen.
- Review the cart yourself before opening Shopify Checkout.
- Pay only through Shopify. Local Loop never takes payment details.

For example, an agent can find a face mask under $20, add it to the cart, and show the new total. The shopper can see every change and remove an item at any time.

## Why WebMCP?

Normal browser agents have to guess which buttons and pages to use. Local Loop gives them clear, structured tools instead. This makes shopping actions more reliable and keeps the agent and shopper working from the same live Shopify cart.

## Agent tools

Local Loop exposes seven WebMCP tools:

| Tool | What it does |
| --- | --- |
| `search_inventory` | Finds products by name, category, price, and stock. |
| `add_to_cart` | Adds an available Shopify product to the shared cart. |
| `get_cart` | Shows the current cart, quantities, and total. |
| `remove_from_cart` | Removes a product from the cart. |
| `fulfill_shopping_list` | Finds and adds several requested products in one step. |
| `checkout` | Creates a Shopify Checkout link only after confirmation. |
| `get_order_status` | Directs the shopper to Shopify's secure order-history page. |

## Try the live demo

1. Open [Local Loop](https://web-mcp-mu.vercel.app/).
2. Browse the live Shopify catalog and add a product with the visible **Add** button.
3. To test the agent tools, open the site in WebMCP-enabled Chrome.
4. In the **WebMCP – Model Context Tool Inspector**, confirm that all seven tools appear.
5. Run `search_inventory`, then `add_to_cart`, and finally `get_cart`.
6. Use `checkout` only to prepare the Shopify review page. Do not enter payment information for a demo.

To enable the Chrome preview, turn on `chrome://flags/#enable-webmcp-testing` and relaunch Chrome.

## How it works

```text
Shopper or browser agent
          ↓
   Local Loop WebMCP tools
          ↓
 Shopify live catalog and cart
          ↓
 Shopify Checkout (shopper reviews and pays)
```

The app keeps the Shopify private access token on the server. It is never sent to the browser or exposed through a WebMCP tool.

## Testing proof

Local Loop has been tested on the public Vercel deployment with live Shopify data.

- The public catalog loads real Shopify products, prices, and stock.
- A browser agent can search inventory, add an item, and read the shared cart.
- The WebMCP Inspector shows all seven tools on the live site.
- Checkout creates a Shopify review link only after explicit confirmation. No payment is collected by Local Loop.

## Built with

- Next.js, React, TypeScript, and Tailwind CSS
- WebMCP with Zod-validated tool inputs
- Shopify Storefront API and Cart API
- Vercel for public hosting

## Run it locally

1. Install dependencies:

   ```bash
   npm install
   ```

2. Copy `.env.example` to `.env.local` and enter your own Shopify details:

   ```env
   SHOPIFY_STORE_DOMAIN=your-store.myshopify.com
   SHOPIFY_STOREFRONT_PRIVATE_ACCESS_TOKEN=your-private-storefront-token
   SHOPIFY_STOREFRONT_API_VERSION=2026-07
   ```

3. Start the app:

   ```bash
   npm run dev
   ```

4. Open `http://localhost:3000`.

Keep `.env.local` private. It is ignored by Git and must never be committed.

## Before sharing your own deployment

- Add the three Shopify variables as private environment variables in your hosting provider.
- Test the live catalog, cart, and checkout handoff.
- Confirm all seven WebMCP tools appear in a WebMCP-enabled browser.
- Never share a Shopify private token or a full checkout URL.

## Current scope

Local Loop is a working portfolio demo with a real Shopify cart. A full merchant product would additionally need customer accounts, Shopify webhooks for inventory updates, order workflows, audit logs, privacy documentation, and merchant approval before accepting real orders.
