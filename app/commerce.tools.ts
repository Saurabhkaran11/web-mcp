import { defineToolContract } from "@webmcp-registry/kit";
import { z } from "zod";

export const searchInventoryContract = defineToolContract({
  name: "search_inventory",
  description: "Search the live local storefront inventory by product, category, budget, and stock availability.",
  kind: "read",
  input: z.object({
    query: z.string().optional().describe("Words to match in the product name or description."),
    category: z.string().optional().describe("Product category such as beauty, groceries, or furniture."),
    max_price: z.number().optional().describe("Maximum item price in US dollars."),
    availability: z.enum(["in_stock", "low_stock", "all"]).optional().describe("Whether to show available, low-stock, or all items."),
  }),
});

export const addToCartContract = defineToolContract({
  name: "add_to_cart",
  description: "Add a live inventory item to the shopper's local cart and update the visible cart immediately.",
  kind: "write",
  input: z.object({
    item_id: z.string().describe("The product ID returned by search_inventory."),
    quantity: z.number().int().min(1).max(20).describe("Number of units to add."),
  }),
});

export const getCartContract = defineToolContract({
  name: "get_cart",
  description: "Read the shopper's current cart: every line item with quantity, unit price, and the running total.",
  kind: "read",
  input: z.object({}),
});

export const removeFromCartContract = defineToolContract({
  name: "remove_from_cart",
  description: "Remove an item (or reduce its quantity) from the shopper's cart and update the visible cart immediately.",
  kind: "write",
  input: z.object({
    item_id: z.string().describe("The product ID of the cart line to remove."),
    quantity: z.number().int().min(1).max(20).optional().describe("Units to remove. Omit to remove the entire line."),
  }),
});

export const checkoutContract = defineToolContract({
  name: "checkout",
  description: "Place the order for everything currently in the cart. Requires explicit confirmation; returns an order ID the shopper can track with get_order_status.",
  kind: "write",
  input: z.object({
    confirm: z.literal(true).describe("Must be true. Only pass after the shopper has approved the cart contents and total."),
  }),
});

export const orderStatusContract = defineToolContract({
  name: "get_order_status",
  description: "Track a placed order in real time as it moves from packing to out-for-delivery to delivered.",
  kind: "read",
  input: z.object({
    order_id: z.string().optional().describe("Order ID from checkout. Omit to get the most recent order."),
  }),
});

export const fulfillShoppingListContract = defineToolContract({
  name: "fulfill_shopping_list",
  description: "Fulfil a whole shopping list in one call: for each entry, find the best-priced in-stock match in live inventory and add it to the cart. Returns what matched and what could not be found.",
  kind: "write",
  input: z.object({
    items: z.array(z.object({
      query: z.string().describe("Words describing the wanted product, e.g. 'lipstick' or 'honey'."),
      quantity: z.number().int().min(1).max(20).optional().describe("Units wanted. Defaults to 1."),
      max_price: z.number().optional().describe("Skip matches above this unit price in US dollars."),
    })).min(1).max(10).describe("The shopping list entries to fulfil."),
  }),
});
