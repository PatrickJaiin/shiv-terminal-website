// ---------- transcript fetching (multi-client innertube + scrape fallback) ----------

const INNERTUBE_PLAYER = "https://www.youtube.com/youtubei/v1/player?prettyPrint=false";
const ANDROID_UA = "com.google.android.youtube/20.10.38 (Linux; U; Android 14)";
const IOS_UA = "com.google.ios.youtube/19.45.4 (iPhone16,2; U; CPU iOS 18_1_0 like Mac OS X)";
const WEB_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

// Multiple client variants - YouTube serves different responses to each, and at least
// one usually returns captionTracks even when others get filtered out by IP rules.
const INNERTUBE_CLIENTS = [
  {
    name: "ANDROID",
    ua: ANDROID_UA,
    body: { context: { client: { clientName: "ANDROID", clientVersion: "20.10.38", androidSdkVersion: 34, hl: "en", gl: "US" } } },
  },
  {
    name: "IOS",
    ua: IOS_UA,
    body: { context: { client: { clientName: "IOS", clientVersion: "19.45.4", deviceMake: "Apple", deviceModel: "iPhone16,2", hl: "en", gl: "US" } } },
  },
  {
    name: "TVHTML5_SIMPLY_EMBEDDED_PLAYER",
    ua: WEB_UA,
    body: {
      context: {
        client: {
          clientName: "TVHTML5_SIMPLY_EMBEDDED_PLAYER",
          clientVersion: "2.0",
          hl: "en",
          gl: "US",
        },
        thirdParty: { embedUrl: "https://www.youtube.com" },
      },
    },
  },
  {
    name: "WEB",
    ua: WEB_UA,
    body: { context: { client: { clientName: "WEB", clientVersion: "2.20240924.00.00", hl: "en", gl: "US" } } },
  },
];

function decodeEntities(s) {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)));
}

function parseTranscriptXml(xml) {
  const pSegments = [];
  const pRegex = /<p\s+t="\d+"[^>]*>([\s\S]*?)<\/p>/g;
  let pm;
  while ((pm = pRegex.exec(xml)) !== null) {
    const inner = pm[1];
    const words = [];
    const sRegex = /<s[^>]*>([^<]*)<\/s>/g;
    let sm;
    while ((sm = sRegex.exec(inner)) !== null) words.push(sm[1]);
    if (words.length > 0) pSegments.push(words.join(""));
    else {
      const plain = inner.replace(/<[^>]+>/g, "");
      if (plain.trim()) pSegments.push(plain);
    }
  }
  if (pSegments.length > 0) return pSegments.map(decodeEntities);

  const textSegments = [];
  const tRegex = /<text[^>]*>([\s\S]*?)<\/text>/g;
  let tm;
  while ((tm = tRegex.exec(xml)) !== null) textSegments.push(tm[1]);
  return textSegments.map(decodeEntities);
}

// Hard timeout wrapper - prevents hanging fetches from blowing the
// Vercel function budget. YouTube's blocked endpoints often hang
// without erroring, so each call gets its own AbortController.
function fetchWithTimeout(url, opts = {}, timeoutMs = 3500) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  return fetch(url, { ...opts, signal: ctrl.signal }).finally(() => clearTimeout(timer));
}

async function tryInnertubeClient(videoId, client) {
  try {
    const res = await fetchWithTimeout(INNERTUBE_PLAYER, {
      method: "POST",
      headers: { "Content-Type": "application/json", "User-Agent": client.ua },
      body: JSON.stringify({ ...client.body, videoId }),
    }, 3500);
    if (!res.ok) return null;
    const data = await res.json();
    const tracks = data?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
    if (tracks && tracks.length > 0) return tracks;
    return null;
  } catch {
    return null;
  }
}

async function tryWebScrape(videoId) {
  try {
    const res = await fetchWithTimeout(`https://www.youtube.com/watch?v=${videoId}`, {
      headers: { "User-Agent": WEB_UA, "Accept-Language": "en-US,en;q=0.9" },
    }, 4000);
    if (!res.ok) return null;
    const html = await res.text();
    const match = html.match(/"captionTracks":\s*(\[.*?\])/);
    if (!match) return null;
    return JSON.parse(match[1]);
  } catch {
    return null;
  }
}

// Supadata uses a residential proxy pool, so it bypasses YouTube's
// cloud-IP block that hits Vercel/AWS. When configured, this is the
// fastest and most reliable path - we try it FIRST on Vercel-like
// environments where Innertube is dead.
async function trySupadata(videoId, apiKey) {
  if (!apiKey) return null;
  try {
    const res = await fetchWithTimeout(
      `https://api.supadata.ai/v1/youtube/transcript?videoId=${videoId}&text=true`,
      { headers: { "x-api-key": apiKey } },
      6000
    );
    if (!res.ok) return null;
    const data = await res.json();
    return data?.content || data?.text || null;
  } catch {
    return null;
  }
}

function truncateTranscript(text) {
  const fullText = text.replace(/\s+/g, " ").trim();
  if (!fullText) return null;
  const words = fullText.split(" ");
  return words.length > 5000 ? words.slice(0, 5000).join(" ") + "..." : fullText;
}

async function fetchTranscript(videoId) {
  const tried = [];

  // Fast path: when Supadata is configured, try it FIRST. On Vercel/AWS
  // YouTube blocks the Innertube API entirely, so the 4 client attempts
  // are pure dead time. Supadata succeeds in ~1-2s via residential proxy.
  if (process.env.SUPADATA_API_KEY) {
    tried.push("SUPADATA");
    const supaText = await trySupadata(videoId, process.env.SUPADATA_API_KEY);
    if (supaText) {
      const result = truncateTranscript(supaText);
      if (result) return result;
    }
  }

  // Fallback: try each Innertube client variant in sequence
  let tracks = null;
  for (const client of INNERTUBE_CLIENTS) {
    tried.push(client.name);
    tracks = await tryInnertubeClient(videoId, client);
    if (tracks) break;
  }

  // Last resort before giving up: scrape the watch page HTML
  if (!tracks) {
    tried.push("WEB_SCRAPE");
    tracks = await tryWebScrape(videoId);
  }

  if (tracks && tracks.length > 0) {
    const track =
      tracks.find((t) => t.languageCode === "en") ||
      tracks.find((t) => t.languageCode?.startsWith("en")) ||
      tracks[0];

    if (track?.baseUrl) {
      try {
        const capRes = await fetchWithTimeout(
          track.baseUrl,
          { headers: { "User-Agent": ANDROID_UA } },
          4000
        );
        if (capRes.ok) {
          const xml = await capRes.text();
          const segments = parseTranscriptXml(xml);
          const result = truncateTranscript(segments.join(" "));
          if (result) return result;
        }
      } catch {
        // fall through
      }
    }
  }

  throw new Error(
    `No captions accessible (tried: ${tried.join(", ")}). YouTube may be blocking server-side transcript fetching from this IP, or the video has no captions.`
  );
}

// ---------- LLM integration ----------

function buildPrompt(title1, transcript1, title2, transcript2, parameters) {
  const paramList = parameters
    .map((p, i) => `${i + 1}. ${p.key} - ${p.description} (${p.scale})`)
    .join("\n");

  const jsonFields = parameters.map((p) => `"${p.key}": N`).join(", ");

  return `You are an expert linguistic analyst. Compare these two video transcripts and score each on the following parameters. Return ONLY valid JSON, no extra text.

Parameters:
${paramList}

Text 1 — Title: "${title1}"
${transcript1}

Text 2 — Title: "${title2}"
${transcript2}

Return JSON in exactly this format:
{
  "text1": { ${jsonFields} },
  "text2": { ${jsonFields} }
}`;
}

async function callClaude(prompt, apiKey) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: 1024,
      messages: [{ role: "user", content: prompt }],
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Claude API error ${res.status}: ${err}`);
  }
  const data = await res.json();
  return data.content[0].text;
}

async function callGemini(prompt, apiKey) {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite-preview:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.3, maxOutputTokens: 1024 },
      }),
    }
  );
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Gemini API error ${res.status}: ${err}`);
  }
  const data = await res.json();
  return data.candidates[0].content.parts[0].text;
}

async function callSarvam(prompt, apiKey) {
  const res = await fetch("https://api.sarvam.ai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "sarvam-m",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.3,
      max_tokens: 1024,
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Sarvam API error ${res.status}: ${err}`);
  }
  const data = await res.json();
  return data.choices[0].message.content;
}

async function callLLM(prompt, provider, keys) {
  switch (provider) {
    case "claude":
      return callClaude(prompt, keys.anthropic);
    case "gemini":
      return callGemini(prompt, keys.gemini);
    case "sarvam":
      return callSarvam(prompt, keys.sarvam);
    default:
      throw new Error(`Unknown LLM provider: ${provider}`);
  }
}

function parseLLMResponse(text, parameterKeys) {
  const cleaned = text.replace(/```json\s*/g, "").replace(/```\s*/g, "");
  const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("No JSON found in LLM response");

  const parsed = JSON.parse(jsonMatch[0]);
  if (!parsed.text1 || !parsed.text2) throw new Error("Invalid response structure");

  for (const key of parameterKeys) {
    if (typeof parsed.text1[key] !== "number") parsed.text1[key] = parseFloat(parsed.text1[key]) || 50;
    if (typeof parsed.text2[key] !== "number") parsed.text2[key] = parseFloat(parsed.text2[key]) || 50;
  }

  return parsed;
}

// ---------- handler ----------

// Vercel: bump function timeout from default 10s to 60s. No-op on Hobby
// (capped at 10s), takes effect on Pro+ where the cap is 60s.
export const config = { maxDuration: 60 };

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });

  try {
    const { userVideoId, comparisonVideoId, userTitle, comparisonTitle, llmProvider, parameters } =
      req.body;

    if (!userVideoId || !comparisonVideoId) {
      return res.status(400).json({ error: "userVideoId and comparisonVideoId are required" });
    }

    // Use custom parameters or defaults
    const params = parameters || DEFAULT_PARAMETERS;
    const paramKeys = params.map((p) => p.key);

    const keys = {
      anthropic: req.body.anthropicKey || process.env.ANTHROPIC_API_KEY,
      gemini: req.body.geminiKey || process.env.GEMINI_API_KEY,
      sarvam: req.body.sarvamKey || process.env.SARVAM_API_KEY,
    };

    const provider = llmProvider || "claude";
    const requiredKey =
      provider === "claude" ? keys.anthropic : provider === "gemini" ? keys.gemini : keys.sarvam;
    if (!requiredKey) {
      return res.status(400).json({
        error: `API key for ${provider} is required. Set the env var or pass it in the request.`,
      });
    }

    // Fetch transcripts
    let userTranscript, compTranscript;
    try {
      userTranscript = await fetchTranscript(userVideoId);
    } catch (err) {
      return res
        .status(400)
        .json({
          error: `Could not get transcript for your video: ${err.message}`,
          errorType: "user_transcript",
          fatal: true,
        });
    }
    try {
      compTranscript = await fetchTranscript(comparisonVideoId);
    } catch (err) {
      return res
        .status(400)
        .json({
          error: `No transcript for comparison video: ${err.message}`,
          errorType: "comparison_transcript",
          skippable: true,
        });
    }

    // Sarvam has a smaller context window, truncate more aggressively
    const maxChars = provider === "sarvam" ? 3000 : 12000;

    // Build prompt with custom parameters
    const prompt = buildPrompt(
      userTitle || "User Video",
      userTranscript.slice(0, maxChars),
      comparisonTitle || "Comparison Video",
      compTranscript.slice(0, maxChars),
      params
    );

    const rawResponse = await callLLM(prompt, provider, keys);
    const parsed = parseLLMResponse(rawResponse, paramKeys);

    return res.status(200).json({
      userVideoId,
      comparisonVideoId,
      comparisonTitle,
      text1: parsed.text1,
      text2: parsed.text2,
      provider,
    });
  } catch (err) {
    console.error("Analyze error:", err);
    return res.status(500).json({ error: err.message || "Analysis failed" });
  }
}

// ---------- default parameters ----------

const DEFAULT_PARAMETERS = [
  { key: "readability", description: "Overall readability score", scale: "0-100, higher = more readable" },
  { key: "fleschKincaid", description: "Flesch-Kincaid grade level needed to understand", scale: "1-20" },
  { key: "colemanLiau", description: "Coleman-Liau reading difficulty index", scale: "1-20" },
  { key: "lexicalDensity", description: "Percentage of content-bearing words", scale: "0-100" },
  { key: "cohesion", description: "Flow and connectivity of ideas", scale: "0-100" },
  { key: "sentiment", description: "Emotional positivity and tone", scale: "0-100" },
  { key: "keywordFrequency", description: "How keyword-rich and SEO-optimized the content is", scale: "0-100" },
  { key: "relevance", description: "How well content matches the video title", scale: "0-100" },
  { key: "easiness", description: "Ease of understanding for a general audience", scale: "0-100" },
  { key: "technicality", description: "Technical depth and specialized knowledge", scale: "0-100" },
  { key: "jargon", description: "Domain-specific terminology density", scale: "0-100" },
];
