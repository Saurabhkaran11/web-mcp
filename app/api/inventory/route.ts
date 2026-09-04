import { NextResponse } from "next/server";
import { isShopifyConfigured, shopifyRequest } from "../../lib/shopify";

const FALLBACK_PRODUCTS = [
  { id: "101", title: "Cedar Citrus Soap", description: "Hand-poured citrus and cedar bar soap from a neighborhood maker.", price: 8.5, stock: 14, brand: "Juniper & Co.", category: "beauty", thumbnail: "https://cdn.dummyjson.com/product-images/1/thumbnail.webp", variant_title: "Default Title" },
  { id: "102", title: "Oat Milk Cold Brew", description: "Small-batch coffee concentrate, ready for an easy iced latte.", price: 11, stock: 9, brand: "Daybreak", category: "groceries", thumbnail: "https://cdn.dummyjson.com/product-images/6/thumbnail.webp", variant_title: "Default Title" },
  { id: "103", title: "Canvas Market Tote", description: "Reusable everyday carry bag made for a market run.", price: 18, stock: 6, brand: "Field Notes", category: "accessories", thumbnail: "https://cdn.dummyjson.com/product-images/20/thumbnail.webp", variant_title: "Default Title" },
  { id: "104", title: "Rose Clay Mask", description: "Gentle mineral face mask for a ten-minute reset.", price: 16, stock: 4, brand: "Juniper & Co.", category: "beauty", thumbnail: "https://cdn.dummyjson.com/product-images/18/thumbnail.webp", variant_title: "Default Title" },
  { id: "105", title: "Wildflower Honey", description: "Raw seasonal honey from a local cooperative.", price: 13.5, stock: 11, brand: "Golden Hour", category: "groceries", thumbnail: "https://cdn.dummyjson.com/product-images/8/thumbnail.webp", variant_title: "Default Title" },
  { id: "106", title: "Desk Plant Pot", description: "A small ceramic pot for a brighter workspace.", price: 22, stock: 5, brand: "Moss & Matter", category: "home", thumbnail: "https://cdn.dummyjson.com/product-images/30/thumbnail.webp", variant_title: "Default Title" },
];

type ShopifyProducts = {
  products: {
    nodes: Array<{
      id: string;
      title: string;
      description: string;
      vendor: string;
      productType: string;
      featuredImage: { url: string } | null;
      variants: {
        nodes: Array<{
          id: string;
          title: string;
          availableForSale: boolean;
          quantityAvailable: number | null;
          price: { amount: string };
          image: { url: string } | null;
        }>;
      };
    }>;
  };
};

export async function GET() {
  if (isShopifyConfigured()) {
    try {
      const data = await shopifyRequest<ShopifyProducts>(`
        query LocalLoopProducts {
          products(first: 30, sortKey: TITLE) {
            nodes {
              id title description vendor productType featuredImage { url }
              variants(first: 20) {
                nodes { id title availableForSale quantityAvailable price { amount } image { url } }
              }
            }
          }
        }
      `);
      const products = data.products.nodes.flatMap((product) => {
        const variant = product.variants.nodes.find((item) => item.availableForSale) ?? product.variants.nodes[0];
        if (!variant) return [];
        return [{
          id: variant.id,
          title: product.title,
          description: product.description || "A Local Loop catalog item.",
          price: Number(variant.price.amount),
          stock: variant.quantityAvailable ?? (variant.availableForSale ? 1 : 0),
          brand: product.vendor || "Local Loop Market",
          category: product.productType || "Local favorites",
          thumbnail: variant.image?.url ?? product.featuredImage?.url ?? "https://cdn.dummyjson.com/product-images/1/thumbnail.webp",
          variant_title: variant.title,
        }];
      });
      return NextResponse.json({ products, source: "shopify", updatedAt: new Date().toISOString() }, { headers: { "Cache-Control": "no-store" } });
    } catch {
      // Keep the demo usable while credentials or the remote store are unavailable.
    }
  }

  return NextResponse.json({ products: FALLBACK_PRODUCTS, source: "built-in-demo", updatedAt: new Date().toISOString() }, { headers: { "Cache-Control": "no-store" } });
}
