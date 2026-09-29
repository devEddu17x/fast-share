/**
 * Retrieves or generates an anonymous, unique device identifier stored in localStorage.
 * Used for per-device rate limiting and session differentiation across shared WiFi networks.
 */
export function getDeviceId(): string {
  if (typeof window === "undefined") return "anonymous";

  try {
    let id = localStorage.getItem("fast_share_device_id");
    if (!id || typeof id !== "string" || id.length < 10) {
      id =
        typeof crypto !== "undefined" && crypto.randomUUID
          ? crypto.randomUUID()
          : `dev-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
      localStorage.setItem("fast_share_device_id", id);
    }
    return id;
  } catch {
    return "anonymous";
  }
}
