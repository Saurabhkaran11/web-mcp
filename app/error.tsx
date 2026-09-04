"use client";

export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="grid min-h-screen place-items-center bg-[#f8f7f2] px-6 text-[#172118]">
      <section className="max-w-md rounded-[2rem] border border-[#174b36]/15 bg-white p-8 shadow-xl">
        <p className="text-sm font-bold uppercase tracking-[.2em] text-[#e15b35]">Local Loop</p>
        <h1 className="mt-4 text-3xl font-black tracking-tight">The storefront needs a refresh.</h1>
        <p className="mt-3 leading-7 text-[#174b36]/70">Your cart is stored in this browser. Try again to reload the storefront safely.</p>
        <button onClick={reset} className="mt-7 rounded-full bg-[#174b36] px-5 py-3 text-sm font-bold text-white transition hover:bg-[#e15b35]">Try again</button>
      </section>
    </main>
  );
}
