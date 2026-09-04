# Local Loop — Smart Local Commerce Agent

A real-time Next.js + Tailwind storefront that exposes live inventory search and cart actions through WebMCP.

## Run locally

```bash
npm install
npm run dev
```

Open `http://localhost:3000` in Chrome 149+ with `chrome://flags/#enable-webmcp-testing` enabled. The app polls DummyJSON every 15 seconds and registers `search_inventory` and `add_to_cart` through `@webmcp-registry/kit`.

## WebMCP tools

- `search_inventory`: query, category, max price, availability
- `add_to_cart`: item ID and quantity

For a Vercel deploy, import this folder as a project or run `npx vercel`. The `/api/inventory` route is serverless-compatible and uses a no-cache fetch for fresh stock snapshots.
