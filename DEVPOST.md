# Local Loop — Smart Local Commerce Agent

## One-line pitch

Local Loop is a live Shopify storefront where a shopper and a browser agent build the same cart together through WebMCP, while the shopper remains in control of checkout.

## Inspiration

Online shopping contains a lot of repetitive work: searching the catalog, comparing prices, checking stock, and creating a cart. Browser agents can make those tasks easier, but only if a site gives them clear, reliable actions instead of forcing them to guess how to use its interface.

I wanted to show an agent-native commerce experience where automation does not take control away from the shopper. The shopper should see every cart change, approve the selected products, and make the final purchase decision in Shopify.

## What it does

Local Loop connects a live Shopify catalog and cart to seven WebMCP tools. A browser agent can search live products, add and remove Shopify variants, inspect the cart, and prepare a shopping list. The shopper sees those changes immediately in the same storefront.

The checkout flow is intentionally human-controlled. An agent can prepare the cart, but the shopper completes a short Cloudflare Turnstile verification and explicitly confirms before Local Loop opens Shopify Checkout. Local Loop never receives payment information.

## Why WebMCP fits this use case

Commerce actions are live and stateful: inventory changes, a cart belongs to a browser session, and checkout needs a clear human decision. WebMCP makes those actions discoverable and schema-validated for an agent. Instead of scraping the page or guessing which controls to use, an agent receives tools such as `search_inventory` and `add_to_cart` with explicit inputs and results.

The important result is a shared workflow. A shopper can ask for a budget-conscious shopping list, let the agent find matching live products, and review the exact same Shopify cart before it changes hands to Shopify Checkout.

## What people and agents can do together that was difficult before

The shopper provides intent and remains the decision-maker. The agent handles catalog discovery and cart preparation. Both work in the same browser session and see the same cart state, without a separate agent dashboard, a scraped catalog, or a disconnected checkout flow.

## How I built it

- **Next.js 16, React 19, TypeScript, and Tailwind CSS** power the storefront.
- **`@webmcp-registry/kit` and Zod** define and register seven structured WebMCP tools from the page.
- **Shopify Storefront API and Cart API** provide live products, stock, cart state, and Shopify's secure checkout URL.
- **Cloudflare Turnstile** is validated server-side before checkout. A signed, five-minute browser verification lets the same shopper or browser agent prepare checkout after the human check.
- **Vercel** hosts the production app and provides Web Analytics.

## Challenges I ran into

The main challenge was keeping browser-agent actions and visible UI state perfectly aligned. I solved this by making the WebMCP tool handlers use the same cart and inventory functions as the storefront itself, rather than building separate agent-only code paths.

The other challenge was preserving shopper control at checkout. The final design keeps payment inside Shopify and adds a server-verified human check before the checkout URL can be created. Agents can help prepare the order, but they cannot silently move a shopper into payment.

## Accomplishments that I'm proud of

- A real Shopify-backed cart rather than mock product data.
- Seven working WebMCP tools that appear in a compatible browser inspector.
- Shopping List Mode, where a shopper can review live matches before allowing bulk cart changes.
- A checkout flow that combines explicit confirmation, server-side bot protection, and Shopify's secure payment experience.
- A public, deployed project with a short narrated demo and clear local setup instructions.

## What I learned

I learned how WebMCP changes the design of a web app: instead of treating agents as external scrapers, the app can deliberately expose safe, descriptive capabilities. I also learned how to coordinate browser state, server-side Shopify calls, secure cookies, and a human approval boundary in one user experience.

## What's next

- Add Shopify webhooks for faster inventory updates.
- Add customer accounts and secure order-history retrieval where a merchant approves it.
- Add audit events and merchant controls for agent activity.
- Add broader accessibility, privacy, and operations review before using the project for real customer orders.

## Links

- Live app: <https://web-mcp-mu.vercel.app/>
- Demo video: <https://youtu.be/ER8LuhkWXhM>
- Source repository: <https://github.com/Saurabhkaran11/web-mcp>

## Judge testing instructions

1. Open the live URL in ChatGPT's in-app browser, or Google Chrome with `chrome://flags/#enable-webmcp-testing` enabled.
2. Open the WebMCP inspector and confirm all seven tools are visible.
3. Call `search_inventory`, `add_to_cart`, and `get_cart` using an ID returned from search.
4. For checkout, complete the visible **Protected checkout** human check in the same browser session, then call `checkout` with `confirm: true` or use the visible button.
5. Shopify Checkout opens for final review. Do not enter payment information for this demo.
