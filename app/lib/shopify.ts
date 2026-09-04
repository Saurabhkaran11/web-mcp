type ShopifyError = { message: string };

type ShopifyResponse<T> = {
  data?: T;
  errors?: ShopifyError[];
};

function getConfiguration() {
  const domain = process.env.SHOPIFY_STORE_DOMAIN?.replace(/^https?:\/\//, "").replace(/\/$/, "");
  const privateAccessToken = process.env.SHOPIFY_STOREFRONT_PRIVATE_ACCESS_TOKEN;
  const apiVersion = process.env.SHOPIFY_STOREFRONT_API_VERSION ?? "2026-07";

  if (!domain || !privateAccessToken) {
    throw new Error("Shopify is not configured. Add the store domain and private Storefront API token to .env.local.");
  }

  return { domain, privateAccessToken, apiVersion };
}

export function isShopifyConfigured() {
  return Boolean(process.env.SHOPIFY_STORE_DOMAIN && process.env.SHOPIFY_STOREFRONT_PRIVATE_ACCESS_TOKEN);
}

export async function shopifyRequest<T>(query: string, variables: Record<string, unknown> = {}, buyerIp?: string): Promise<T> {
  const { domain, privateAccessToken, apiVersion } = getConfiguration();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "Shopify-Storefront-Private-Token": privateAccessToken,
  };

  if (buyerIp) headers["Shopify-Storefront-Buyer-IP"] = buyerIp;

  const response = await fetch(`https://${domain}/api/${apiVersion}/graphql.json`, {
    method: "POST",
    headers,
    body: JSON.stringify({ query, variables }),
    cache: "no-store",
  });
  const payload = await response.json() as ShopifyResponse<T>;

  if (!response.ok || payload.errors?.length || !payload.data) {
    throw new Error(payload.errors?.map((error) => error.message).join(" ") || "Shopify did not return catalog data.");
  }

  return payload.data;
}
