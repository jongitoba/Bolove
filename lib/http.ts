// Every external API this app calls server-side (NVDB, NorStøy WMS,
// Kartverket's address search) is a government service with no SLA and no
// cache in front of it yet. A single transient 5xx from any of them
// (confirmed live: NVDB returned a real 503 under moderate query volume)
// would otherwise fail the whole request for the end user. Retries only 5xx
// (server-side, plausibly transient) - a 4xx means the request itself is
// wrong and retrying it changes nothing.
const DEFAULT_MAX_RETRIES = 2;
const BASE_BACKOFF_MS = 200;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function fetchWithRetry(
  url: string,
  init?: RequestInit,
  maxRetries: number = DEFAULT_MAX_RETRIES,
): Promise<Response> {
  let response: Response;
  for (let attempt = 0; ; attempt++) {
    response = await fetch(url, init);
    if (response.ok || response.status < 500 || attempt >= maxRetries) {
      return response;
    }
    await delay(BASE_BACKOFF_MS * 2 ** attempt);
  }
}
