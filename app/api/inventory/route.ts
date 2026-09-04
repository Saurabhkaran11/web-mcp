import { NextResponse } from "next/server";

export async function GET() {
  const response = await fetch("https://dummyjson.com/products?limit=30", { next: { revalidate: 0 } });
  if (!response.ok) return NextResponse.json({ products: [] }, { status: 502 });
  const data = await response.json();
  const products = data.products.map((product: { id: number; title: string; description: string; price: number; rating: number; stock: number; brand?: string; category: string; thumbnail: string }) => ({
    id: String(product.id), title: product.title, description: product.description, price: product.price,
    rating: product.rating, stock: Math.max(0, product.stock + Math.floor(Math.random() * 5) - 2),
    brand: product.brand ?? "Local maker", category: product.category, thumbnail: product.thumbnail,
  }));
  return NextResponse.json({ products, updatedAt: new Date().toISOString() });
}
