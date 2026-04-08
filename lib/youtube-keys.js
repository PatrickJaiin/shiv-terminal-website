// Shared YouTube Data API key rotation - used by discover.js and stats.js.
// Tries each key in order, marking any that hit their daily quota as dead
// for the rest of the warm serverless instance.

// Module-level cache. Persists across calls within a warm instance,
// resets on cold start (which is fine - we hit one wasted 403 to re-mark).
const deadKeys = new Set();

export function getYouTubeKeys(overrideKey) {
  if (overrideKey) return [overrideKey];
  const keys = [
    process.env.YOUTUBE_API_KEY,
    process.env.YOUTUBE_API_KEY_2,
    process.env.YOUTUBE_API_KEY_3,
  ].filter(Boolean);
  const live = keys.filter((k) => !deadKeys.has(k));
  return live.length > 0 ? live : keys;
}

// Fetch a YouTube Data API URL, rotating through keys on quota errors.
// `urlBuilder` is `(key) => fullUrl` so callers build their query string
// once and just append the rotating key.
export async function ytFetch(urlBuilder, keys) {
  // Diagnostic suffix: how many keys were actually visible to this call
  // and which are in the dead cache. Lets us tell at a glance whether a
  // failure is "Vercel only injected 1 env var" vs "all keys really dead".
  const tried = keys.map((k) => `...${k.slice(-4)}`);
  const deadList = tried.filter((_, i) => deadKeys.has(keys[i]));
  const diag = ` [received ${keys.length} key(s): ${tried.join(", ")}; dead: ${deadList.join(", ") || "none"}]`;

  let lastError;
  for (const key of keys) {
    if (deadKeys.has(key)) continue;
    const res = await fetch(urlBuilder(key));
    if (res.ok) return res.json();
    const errBody = await res.json().catch(() => null);
    const isQuota = errBody?.error?.errors?.some(
      (e) => e.reason === "quotaExceeded" || e.reason === "rateLimitExceeded"
    );
    if (isQuota) {
      deadKeys.add(key);
      lastError = new Error(`Quota exceeded for key ...${key.slice(-4)}${diag}`);
      continue;
    }
    throw new Error(
      `YouTube API error: ${res.status} ${errBody?.error?.message || ""}${diag}`.trim()
    );
  }
  throw lastError || new Error(`No YouTube API keys available${diag}`);
}
