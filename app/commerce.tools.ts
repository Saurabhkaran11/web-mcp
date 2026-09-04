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
