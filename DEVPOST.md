# Local Loop — Smart Local Commerce Agent

## Inspiration
Small storefronts lose customers to friction: shoppers know roughly what they want ("skincare under $25"), but translating that into clicks, filters, and cart actions is busywork. AI agents in the browser can do that work — if the site speaks their language. WebMCP is that language.

## What it does
Local Loop is a live storefront where the inventory itself is agent-accessible. It registers two WebMCP tools directly in the page:

- **`search_inventory`** (read) — query by keywords, category, max price, and stock availability against live inventory
- **`add_to_cart`** (write) — add any item by ID with quantity, with real stock validation

A shopper can tell their browser agent "find skincare under $25 and add two to my cart" — the agent calls the tools, and the human watches the results appear on screen: filtered products, an updated cart, and an "Agent Activity" panel narrating every action in real time.

## Why WebMCP fits this use case
Commerce is the perfect WebMCP shape: the *data* is live (stock changes every 15 seconds via polling), and the *actions* are stateful (the cart lives in the page's React state). A scraper or a server-side API can't do this — the agent needs to act inside the same session the human is looking at. WebMCP lets the agent and the shopper share one cart, one inventory snapshot, one screen.

## What people + agents can do together that wasn't possible
The human sets intent; the agent executes; both see the same UI update instantly. The shopper never leaves the page, never fills a filter form, and can override the agent at any point by clicking — because the agent's tools and the page's buttons call the exact same functions. There's no "agent mode" — it's one storefront, dual-driven.

## How we built it
- **Next.js 15 (App Router) + React 19 + Tailwind 4**
- **`@webmcp-registry/kit`** — tool contracts defined with **Zod** schemas in `app/commerce.tools.ts` (`defineToolContract`), registered from the page component via the `useWebMCPTool` React hook, which wires them into `modelContext` (the WebMCP browser API)
- **Live inventory**: a serverless `/api/inventory` route proxies DummyJSON with no-cache fetches and simulated stock drift; the client polls every 15s
- Tool handlers are the same callbacks the visible UI uses, so agent actions and human clicks are always consistent — including stock-limit validation and low-stock states

## Challenges
Keeping tool results and visible UI perfectly in sync — solved by making the WebMCP handlers *be* the UI handlers, not parallel code paths. Also designing tool schemas descriptive enough that an agent picks the right filters on the first call.

## What's next
Checkout and order-status tools, per-store inventory adapters so any local shop can plug in, and multi-item "shopping list" fulfilment in a single agent call.

## Try it
Open the live URL in Chrome 149+ with `chrome://flags/#enable-webmcp-testing` enabled, then ask your agent: *"Find skincare under $25 and add two to my cart."*
