// ---------- transcript fetching (Android innertube API) ----------

const ANDROID_UA = "com.google.android.youtube/20.10.38 (Linux; U; Android 14)";
const INNERTUBE_PLAYER = "https://www.youtube.com/youtubei/v1/player?prettyPrint=false";
const WEB_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

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
  // Format 3 (Android): <p t="ms" d="ms"><s ac="N">word</s>...</p>
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

  // Legacy format: <text start="N" dur="N">content</text>
  const textSegments = [];
  const tRegex = /<text[^>]*>([\s\S]*?)<\/text>/g;
  let tm;
  while ((tm = tRegex.exec(xml)) !== null) textSegments.push(tm[1]);
  return textSegments.map(decodeEntities);
}

async function fetchTranscript(videoId) {
  // Primary: Android innertube player API (most reliable server-side)
  const playerRes = await fetch(INNERTUBE_PLAYER, {
    method: "POST",
    headers: { "Content-Type": "application/json", "User-Agent": ANDROID_UA },
    body: JSON.stringify({
      context: { client: { clientName: "ANDROID", clientVersion: "20.10.38" } },
      videoId,
    }),
  });

  let tracks;
  if (playerRes.ok) {
    const data = await playerRes.json();
    tracks = data?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
  }

  // Fallback: web page scraping
  if (!tracks || tracks.length === 0) {
    const pageRes = await fetch(`https://www.youtube.com/watch?v=${videoId}`, {
      headers: { "User-Agent": WEB_UA, "Accept-Language": "en-US,en;q=0.9" },
    });
    if (!pageRes.ok) throw new Error(`YouTube page fetch failed: ${pageRes.status}`);
    const html = await pageRes.text();
    const match = html.match(/"captionTracks":\s*(\[.*?\])/);
    if (!match) throw new Error("No captions available for this video");
    tracks = JSON.parse(match[1]);
  }

  if (!tracks || tracks.length === 0) throw new Error("No caption tracks found");

  // Prefer English
  const track =
    tracks.find((t) => t.languageCode === "en") ||
    tracks.find((t) => t.languageCode?.startsWith("en")) ||
    tracks[0];

  const capRes = await fetch(track.baseUrl, { headers: { "User-Agent": ANDROID_UA } });
  if (!capRes.ok) throw new Error("Failed to fetch captions");
  const xml = await capRes.text();

  const segments = parseTranscriptXml(xml);
  const fullText = segments.join(" ").replace(/\s+/g, " ").trim();
  if (!fullText) throw new Error("Transcript is empty");

  // Truncate to ~5000 words to fit LLM context
  const words = fullText.split(" ");
  return words.length > 5000 ? words.slice(0, 5000).join(" ") + "..." : fullText;
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
        .json({ error: `Could not get transcript for your video: ${err.message}` });
    }
    try {
      compTranscript = await fetchTranscript(comparisonVideoId);
    } catch (err) {
      return res
        .status(400)
        .json({ error: `No transcript for comparison video: ${err.message}`, skippable: true });
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
