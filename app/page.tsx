"use client";

import Image from "next/image";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useWebMCPTool } from "@webmcp-registry/kit/react";
import { addToCartContract, checkoutContract, fulfillShoppingListContract, getCartContract, orderStatusContract, removeFromCartContract, searchInventoryContract } from "./commerce.tools";

type Product = { id: string; title: string; description: string; price: number; rating: number; stock: number; brand: string; category: string; thumbnail: string };
type Cart = Record<string, number>;
type Order = { id: string; items: { id: string; title: string; quantity: number; price: number }[]; total: number; placedAt: number };

const money = (value: number) => `$${value.toFixed(2)}`;
const orderStatus = (order: Order, now: number) => { const elapsed = (now - order.placedAt) / 1000; return elapsed < 30 ? "packing" : elapsed < 90 ? "out_for_delivery" : "delivered"; };

export default function Home() {
  const [products, setProducts] = useState<Product[]>([]);
  const [cart, setCart] = useState<Cart>({});
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const [agentMessage, setAgentMessage] = useState("Ready for an agent-assisted shop.");
  const [orders, setOrders] = useState<Order[]>([]);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => { if (!orders.length) return; const timer = setInterval(() => setNow(Date.now()), 5000); return () => clearInterval(timer); }, [orders.length]);

  const refreshInventory = useCallback(async () => {
    const data = await fetch("/api/inventory", { cache: "no-store" }).then((response) => response.json());
    setProducts(data.products);
    setUpdatedAt(new Date(data.updatedAt));
  }, []);

  useEffect(() => { refreshInventory(); const timer = setInterval(refreshInventory, 15000); return () => clearInterval(timer); }, [refreshInventory]);

  const searchInventory = useCallback(({ query: nextQuery, category: nextCategory, max_price, availability = "all" }: { query?: string; category?: string; max_price?: number; availability?: "in_stock" | "low_stock" | "all" }) => {
    const filtered = products.filter((item) => {
      const textMatch = !nextQuery || `${item.title} ${item.description}`.toLowerCase().includes(nextQuery.toLowerCase());
      const categoryMatch = !nextCategory || nextCategory === "all" || item.category === nextCategory;
      const priceMatch = max_price === undefined || item.price <= max_price;
      const availabilityMatch = availability === "all" || (availability === "in_stock" ? item.stock > 5 : item.stock > 0 && item.stock <= 5);
      return textMatch && categoryMatch && priceMatch && availabilityMatch;
    });
    setQuery(nextQuery ?? ""); if (nextCategory) setCategory(nextCategory);
    setAgentMessage(`Found ${filtered.length} matching item${filtered.length === 1 ? "" : "s"} in live inventory.`);
    return { items: filtered.map(({ id, title, price, stock, category }) => ({ id, title, price, stock, category })) };
  }, [products]);

  const addToCart = useCallback(({ item_id, quantity }: { item_id: string; quantity: number }) => {
    const product = products.find((item) => item.id === item_id);
    if (!product) return { success: false, message: "Item not found in live inventory." };
    if (product.stock < quantity) return { success: false, message: `Only ${product.stock} available.` };
    setCart((current) => ({ ...current, [item_id]: (current[item_id] ?? 0) + quantity }));
    setAgentMessage(`${quantity} × ${product.title} added to your cart.`);
    return { success: true, item: { id: product.id, title: product.title, quantity } };
  }, [products]);

  const getCart = useCallback(() => {
    const items = Object.entries(cart).flatMap(([id, quantity]) => { const product = products.find((item) => item.id === id); return product ? [{ id, title: product.title, quantity, unit_price: product.price, line_total: product.price * quantity }] : []; });
    return { items, total: items.reduce((sum, item) => sum + item.line_total, 0) };
  }, [cart, products]);

  const removeFromCart = useCallback(({ item_id, quantity }: { item_id: string; quantity?: number }) => {
    const current = cart[item_id];
    if (!current) return { success: false, message: "That item is not in the cart." };
    const remaining = quantity === undefined ? 0 : Math.max(0, current - quantity);
    setCart((state) => { const next = { ...state }; if (remaining) next[item_id] = remaining; else delete next[item_id]; return next; });
    const title = products.find((item) => item.id === item_id)?.title ?? item_id;
    setAgentMessage(remaining ? `Reduced ${title} to ${remaining} in your cart.` : `Removed ${title} from your cart.`);
    return { success: true, remaining_quantity: remaining };
  }, [cart, products]);

  const checkout = useCallback(() => {
    const { items, total } = getCart();
    if (!items.length) return { success: false, message: "The cart is empty — nothing to check out." };
    const order: Order = { id: `LL-${Date.now().toString(36).toUpperCase()}`, items: items.map(({ id, title, quantity, unit_price }) => ({ id, title, quantity, price: unit_price })), total, placedAt: Date.now() };
    setOrders((state) => [order, ...state]); setCart({}); setNow(Date.now());
    setAgentMessage(`Order ${order.id} placed — ${money(total)}. Track it with get_order_status.`);
    return { success: true, order_id: order.id, total, status: "packing" };
  }, [getCart]);

  const getOrderStatus = useCallback(({ order_id }: { order_id?: string }) => {
    const order = order_id ? orders.find((item) => item.id === order_id) : orders[0];
    if (!order) return { success: false, message: order_id ? `No order ${order_id} found.` : "No orders placed yet." };
    const status = orderStatus(order, Date.now());
    setAgentMessage(`Order ${order.id} is ${status.replaceAll("_", " ")}.`);
    return { success: true, order_id: order.id, status, total: order.total, items: order.items };
  }, [orders]);

  const fulfillShoppingList = useCallback(({ items }: { items: { query: string; quantity?: number; max_price?: number }[] }) => {
    const additions: Record<string, number> = {};
    const results = items.map(({ query: wanted, quantity = 1, max_price }) => {
      const matches = products.filter((item) => `${item.title} ${item.description}`.toLowerCase().includes(wanted.toLowerCase()) && (max_price === undefined || item.price <= max_price) && item.stock >= (cart[item.id] ?? 0) + (additions[item.id] ?? 0) + quantity).sort((a, b) => a.price - b.price);
      const match = matches[0];
      if (!match) return { query: wanted, matched: false as const, message: "No in-stock match within budget." };
      additions[match.id] = (additions[match.id] ?? 0) + quantity;
      return { query: wanted, matched: true as const, item: { id: match.id, title: match.title, price: match.price, quantity } };
    });
    if (Object.keys(additions).length) setCart((state) => { const next = { ...state }; for (const [id, quantity] of Object.entries(additions)) next[id] = (next[id] ?? 0) + quantity; return next; });
    const matchedCount = results.filter((item) => item.matched).length;
    setAgentMessage(`Shopping list: matched ${matchedCount} of ${items.length} item${items.length === 1 ? "" : "s"} and added them to your cart.`);
    return { results, matched: matchedCount, unmatched: items.length - matchedCount };
  }, [products, cart]);

  useWebMCPTool(searchInventoryContract, searchInventory);
  useWebMCPTool(addToCartContract, addToCart);
  useWebMCPTool(getCartContract, getCart);
  useWebMCPTool(removeFromCartContract, removeFromCart);
  useWebMCPTool(checkoutContract, checkout);
  useWebMCPTool(orderStatusContract, getOrderStatus);
  useWebMCPTool(fulfillShoppingListContract, fulfillShoppingList);

  const categories = useMemo(() => ["all", ...Array.from(new Set(products.map((item) => item.category)))], [products]);
  const cartItems = Object.entries(cart).map(([id, quantity]) => ({ product: products.find((item) => item.id === id), quantity })).filter((entry): entry is { product: Product; quantity: number } => Boolean(entry.product));
  const cartTotal = cartItems.reduce((total, { product, quantity }) => total + product.price * quantity, 0);

  return <main className="min-h-screen overflow-hidden">
    <div className="grain pointer-events-none fixed inset-0" />
    <header className="relative border-b border-[#174b36]/15 bg-[#d9f99d] px-6 py-5 md:px-12">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4"><div className="flex items-center gap-3"><div className="grid h-10 w-10 place-items-center rounded-full bg-[#174b36] text-xl text-[#d9f99d]">↗</div><span className="font-black tracking-tight">LOCAL LOOP</span></div><div className="flex items-center gap-2 rounded-full border border-[#174b36]/20 bg-white/50 px-3 py-2 text-xs font-bold"><span className="h-2 w-2 animate-pulse rounded-full bg-emerald-600" /> LIVE INVENTORY · {updatedAt ? `updated ${updatedAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}` : "connecting"}</div></div>
    </header>
    <section className="relative mx-auto grid max-w-7xl gap-10 px-6 py-12 md:grid-cols-[1fr_320px] md:px-12 md:py-20"><div><p className="mb-5 text-sm font-bold uppercase tracking-[.25em] text-[#e15b35]">Neighborhood commerce, upgraded</p><h1 className="max-w-3xl text-5xl font-black leading-[.95] tracking-[-.06em] md:text-8xl">Shop with your <span className="text-[#e15b35]">agent.</span></h1><p className="mt-7 max-w-xl text-lg leading-7 text-[#174b36]/70">Local Loop exposes real storefront actions to AI agents through WebMCP. Ask for what you need; the site handles the details.</p><div className="mt-8 flex flex-wrap gap-3"><span className="rounded-full bg-[#174b36] px-4 py-2 text-xs font-bold text-white">WEBMCP READY</span><span className="rounded-full border border-[#174b36]/20 px-4 py-2 text-xs font-bold">15s STOCK REFRESH</span></div></div><aside className="rounded-[2rem] bg-[#174b36] p-6 text-[#f8f7f2] shadow-xl shadow-[#174b36]/15"><div className="mb-12 flex items-center justify-between"><span className="text-xs font-bold uppercase tracking-widest text-[#d9f99d]">Agent activity</span><span className="text-xl">✦</span></div><p className="text-2xl font-bold leading-tight">“{agentMessage}”</p><div className="mt-10 border-t border-white/20 pt-4 text-sm text-white/60">Try: “Find skincare under $25 and add two to my cart.”</div></aside></section>
    <section className="relative mx-auto grid max-w-7xl items-start gap-8 px-6 pb-20 md:grid-cols-[minmax(0,1fr)_320px] md:px-12"><div><div className="mb-8 flex flex-col gap-4 rounded-2xl border border-[#174b36]/15 bg-white/60 p-4 md:flex-row"><input aria-label="Search inventory" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search the neighborhood shelf..." className="min-w-0 flex-1 rounded-xl bg-transparent px-3 py-3 outline-none placeholder:text-[#174b36]/40" /><select aria-label="Filter by category" value={category} onChange={(event) => setCategory(event.target.value)} className="rounded-xl border-0 bg-[#d9f99d] px-4 py-3 text-sm font-bold outline-none">{categories.map((item) => <option key={item} value={item}>{item.replaceAll("-", " ")}</option>)}</select></div><div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">{products.filter((item) => (!query || `${item.title} ${item.description}`.toLowerCase().includes(query.toLowerCase())) && (category === "all" || item.category === category)).map((product) => <article key={product.id} className="group overflow-hidden rounded-[1.5rem] border border-[#174b36]/10 bg-white transition hover:-translate-y-1 hover:shadow-xl"><div className="relative aspect-[1.15] overflow-hidden bg-[#eef0e6]"><Image src={product.thumbnail} alt={product.title} fill sizes="(max-width: 768px) 100vw, 33vw" className="object-contain p-8 transition duration-500 group-hover:scale-105" /><div className={`absolute left-3 top-3 rounded-full px-3 py-1 text-xs font-bold ${product.stock <= 5 ? "bg-[#ffe0c8] text-[#a03b20]" : "bg-[#d9f99d] text-[#174b36]"}`}>{product.stock <= 5 ? `Only ${product.stock} left` : `${product.stock} in stock`}</div></div><div className="p-5"><div className="mb-2 flex items-start justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-wider text-[#174b36]/45">{product.brand}</p><h2 className="mt-1 text-lg font-black leading-tight">{product.title}</h2></div><span className="text-lg font-black">{money(product.price)}</span></div><div className="mt-5 flex items-center justify-between"><span className="text-sm text-[#174b36]/55">★ {product.rating.toFixed(1)} · {product.category}</span><button onClick={() => addToCart({ item_id: product.id, quantity: 1 })} className="rounded-full bg-[#174b36] px-4 py-2 text-xs font-bold text-white transition hover:bg-[#e15b35]">Add</button></div></div></article>)}</div></div>
    <aside className="w-full rounded-[1.5rem] border border-[#174b36]/15 bg-white/95 p-5 shadow-xl md:sticky md:top-5"><div className="flex items-center justify-between"><div><p className="text-xs font-bold uppercase tracking-widest text-[#e15b35]">Your cart</p><h2 className="text-2xl font-black">{cartItems.reduce((sum, item) => sum + item.quantity, 0)} items</h2></div><span className="text-3xl">🛒</span></div><div className="mt-4 max-h-44 space-y-2 overflow-auto text-sm">{cartItems.length ? cartItems.map(({ product, quantity }) => <div key={product.id} className="flex items-center justify-between gap-3"><span className="truncate">{quantity} × {product.title}</span><span className="flex items-center gap-2"><span className="font-bold">{money(product.price * quantity)}</span><button aria-label={`Remove ${product.title}`} onClick={() => removeFromCart({ item_id: product.id })} className="rounded-full px-1.5 text-[#a03b20] transition hover:bg-[#ffe0c8]">✕</button></span></div>) : <p className="text-[#174b36]/45">Your cart is waiting for an agent.</p>}</div><div className="mt-4 flex justify-between border-t border-[#174b36]/10 pt-3 font-black"><span>Total</span><span>{money(cartTotal)}</span></div>{cartItems.length ? <button onClick={() => checkout()} className="mt-4 w-full rounded-full bg-[#e15b35] py-3 text-sm font-bold text-white transition hover:bg-[#174b36]">Checkout · {money(cartTotal)}</button> : null}
    {orders.length ? <div className="mt-6 border-t border-[#174b36]/10 pt-4"><p className="text-xs font-bold uppercase tracking-widest text-[#e15b35]">Orders</p><div className="mt-3 max-h-40 space-y-3 overflow-auto text-sm">{orders.map((order) => { const status = orderStatus(order, now); return <div key={order.id}><div className="flex items-center justify-between gap-3"><span className="font-bold">{order.id}</span><span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${status === "delivered" ? "bg-[#d9f99d] text-[#174b36]" : status === "out_for_delivery" ? "bg-[#ffe0c8] text-[#a03b20]" : "bg-[#174b36] text-white"}`}>{status.replaceAll("_", " ")}</span></div><p className="mt-1 text-[#174b36]/55">{order.items.reduce((sum, item) => sum + item.quantity, 0)} items · {money(order.total)}</p></div>; })}</div></div> : null}</aside></section>
  </main>;
}
