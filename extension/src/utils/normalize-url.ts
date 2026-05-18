const TRACKING_PARAMETERS = [/^utm_/i, /^fbclid$/i, /^gclid$/i, /^msclkid$/i];

export interface NormalizeUrlOptions {
  keepFragment?: boolean;
}

function decodeUnreserved(value: string): string {
  return value.replace(/%[0-9a-f]{2}/gi, (encoded) => {
    const char = String.fromCharCode(Number.parseInt(encoded.slice(1), 16));
    return /[A-Za-z0-9\-._~]/.test(char) ? char : encoded.toUpperCase();
  });
}

export function normalizeUrl(input: string, options: NormalizeUrlOptions = {}): string {
  const url = new URL(input);
  url.protocol = url.protocol.toLowerCase();
  url.hostname = url.hostname.toLowerCase();
  if ((url.protocol === "http:" && url.port === "80") || (url.protocol === "https:" && url.port === "443")) {
    url.port = "";
  }
  if (!options.keepFragment) url.hash = "";
  if (url.pathname === "/") url.pathname = "/";
  url.pathname = decodeUnreserved(url.pathname);
  const kept = [...url.searchParams.entries()]
    .filter(([key]) => !TRACKING_PARAMETERS.some((pattern) => pattern.test(key)))
    .sort(([aKey, aValue], [bKey, bValue]) => aKey.localeCompare(bKey) || aValue.localeCompare(bValue));
  url.search = "";
  for (const [key, value] of kept) url.searchParams.append(key, value);
  return url.toString();
}

export function domainFromUrl(input: string): string {
  return new URL(input).hostname.toLowerCase();
}
