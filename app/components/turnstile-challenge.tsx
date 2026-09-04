"use client";

import Script from "next/script";
import { useEffect, useRef, useState } from "react";

type TurnstileApi = {
  render: (
    container: HTMLElement,
    options: {
      sitekey: string;
      action: string;
      theme: "light" | "dark" | "auto";
      callback: (token: string) => void;
      "expired-callback": () => void;
      "error-callback": () => void;
    },
  ) => string;
  remove?: (widgetId: string) => void;
};

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

type TurnstileChallengeProps = {
  siteKey: string;
  onSuccess: (token: string) => void;
  onExpired: () => void;
  onError: () => void;
};

export function TurnstileChallenge({
  siteKey,
  onSuccess,
  onExpired,
  onError,
}: TurnstileChallengeProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | null>(null);
  const callbacksRef = useRef({ onSuccess, onExpired, onError });
  const [scriptReady, setScriptReady] = useState(false);

  useEffect(() => {
    callbacksRef.current = { onSuccess, onExpired, onError };
  }, [onError, onExpired, onSuccess]);

  useEffect(() => {
    const container = containerRef.current;
    if (!scriptReady || !container || !window.turnstile || widgetIdRef.current) return;

    const widgetId = window.turnstile.render(container, {
      sitekey: siteKey,
      action: "checkout",
      theme: "light",
      callback: (token) => callbacksRef.current.onSuccess(token),
      "expired-callback": () => callbacksRef.current.onExpired(),
      "error-callback": () => callbacksRef.current.onError(),
    });
    widgetIdRef.current = widgetId;

    return () => {
      window.turnstile?.remove?.(widgetId);
      widgetIdRef.current = null;
    };
  }, [scriptReady, siteKey]);

  return (
    <>
      <Script
        id="cloudflare-turnstile"
        src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"
        strategy="afterInteractive"
        onReady={() => setScriptReady(true)}
      />
      <div ref={containerRef} aria-label="Human verification" />
    </>
  );
}
