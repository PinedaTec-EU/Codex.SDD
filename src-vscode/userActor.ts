import * as os from "node:os";

export function getCurrentActor(): string {
  try {
    const info = os.userInfo();
    if (info.username && info.username.trim().length > 0) {
      return info.username.trim();
    }
  } catch {
    // Fall back to environment-derived values.
  }

  const fallback = process.env.USER ?? process.env.USERNAME ?? "user";
  return fallback.trim().length > 0 ? fallback.trim() : "user";
}
