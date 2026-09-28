/**
 * Validates if the given string is a valid HTTP or HTTPS URL.
 */
export function isValidHttpUrl(urlStr: string): boolean {
  try {
    const parsed = new URL(urlStr);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

/**
 * Resolves the root domain for service URL generation.
 */
export function getBaseDomain(
  env?: { BASE_DOMAIN?: string },
  reqUrl?: string,
): string {
  if (env?.BASE_DOMAIN) {
    return env.BASE_DOMAIN;
  }
  if (reqUrl) {
    try {
      const u = new URL(reqUrl);
      const host = u.host;
      if (host.includes("localhost") || host.includes("127.0.0.1")) {
        return host;
      }
      return host.replace(/^(admin\.)?(share|link|temporal|permanent)\./, "");
    } catch {
      // Fallback below
    }
  }

  // Generic fallback when no environment variable or request URL is provided
  return "localhost:8787";
}

/**
 * Builds the canonical public URL for any of the subdomains / services.
 */
export function buildServiceUrl(
  service: "share" | "link" | "temporal" | "permanent",
  path: string = "",
  env?: { BASE_DOMAIN?: string },
  reqUrl?: string,
): string {
  const baseDomain = getBaseDomain(env, reqUrl);
  const cleanPath = path ? (path.startsWith("/") ? path : `/${path}`) : "";

  if (baseDomain.includes("localhost") || baseDomain.includes("127.0.0.1")) {
    const prefix =
      service === "link" ? "/r" : service === "share" ? "" : `/${service}`;
    return `http://${baseDomain}${prefix}${cleanPath}`;
  }

  return `https://${service}.${baseDomain}${cleanPath}`;
}
