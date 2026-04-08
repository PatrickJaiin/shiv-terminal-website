// Pre-compute the canonical sample run for all (LLM x preset) combos and save
// it as /public/sample-analysis.json. Run from a residential IP - the dev
// server will hit YouTube directly, which works locally but is blocked from
// Vercel's cloud IPs.
//
// Usage:
//   1. In one terminal:  npm run dev
//   2. In another:       node scripts/precompute-sample.mjs
//
// Optional env: BASE_URL (defaults to http://localhost:3000)

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const BASE = process.env.BASE_URL || "http://localhost:3000";
const SAMPLE_QUERY = "How do Google Maps actually works?";
const SAMPLE_VIDEO_ID = "c6wb9xtH7RM";
// Depths to (re)compute on this run. Existing depths in the cache file are
// preserved. Default skips depth 2 since the previous v2 run already covered
// it. Set DEPTHS env var or edit this list to refresh specific depths.
const SAMPLE_DEPTHS = process.env.DEPTHS
  ? process.env.DEPTHS.split(",").map((d) => parseInt(d.trim(), 10))
  : [1, 3, 4, 5];

// Keys MUST match PRESET_YOUTUBE.params and PRESET_RESEARCH.params in
// pages/projects/youtube-algorithm.js. Labels are set on the page side; only
// keys are used to look up cached scores so a description drift here is fine.
const YOUTUBE_PARAMS = [
  { key: "hookStrength", description: "How engaging and attention-grabbing the opening 30 seconds are, does it create curiosity or promise value immediately", scale: "0-100" },
  { key: "informationDensity", description: "Amount of useful, actionable information per minute of content", scale: "0-100" },
  { key: "narrativeStructure", description: "Clarity of story arc, setup, development, payoff", scale: "0-100" },
  { key: "retentionLanguage", description: "Use of curiosity gaps, teasers, open loops, pattern interrupts", scale: "0-100" },
  { key: "seoOptimization", description: "How well the spoken content covers search-relevant keywords", scale: "0-100" },
  { key: "emotionalEngagement", description: "Emotional peaks and valleys, humor, surprise, empathy, excitement", scale: "0-100" },
  { key: "clarity", description: "How well complex concepts are broken down with analogies and examples", scale: "0-100" },
  { key: "pacing", description: "Speed of content delivery, well-paced or dragging or rushing", scale: "0-100" },
  { key: "callToAction", description: "Presence and quality of subscribe, like, comment prompts", scale: "0-100" },
  { key: "shareability", description: "Would someone send this to a friend, unique insights, surprising facts", scale: "0-100" },
  { key: "authority", description: "Does the speaker sound knowledgeable, cite sources, demonstrate expertise", scale: "0-100" },
  { key: "productionQuality", description: "Tightness of script, minimal filler words, repetition, tangents", scale: "0-100" },
];

const RESEARCH_PARAMS = [
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

const COMBOS = [
  { provider: "claude", preset: "youtube", params: YOUTUBE_PARAMS },
  { provider: "claude", preset: "research", params: RESEARCH_PARAMS },
  { provider: "gemini", preset: "youtube", params: YOUTUBE_PARAMS },
  { provider: "gemini", preset: "research", params: RESEARCH_PARAMS },
  { provider: "sarvam", preset: "youtube", params: YOUTUBE_PARAMS },
  { provider: "sarvam", preset: "research", params: RESEARCH_PARAMS },
];

async function post(endpoint, body, { retries = 4 } = {}) {
  let attempt = 0;
  while (true) {
    const res = await fetch(`${BASE}${endpoint}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const text = await res.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      throw new Error(`Non-JSON from ${endpoint} (${res.status}): ${text.slice(0, 200)}`);
    }
    if (res.ok) return data;

    // Retry on upstream rate limits (Claude / Gemini / etc. surface as 429 or
    // 500 inside data.error). Backoff progressively up to `retries` times.
    const errStr = String(data?.error || "");
    const isRateLimited =
      errStr.includes("429") ||
      errStr.includes("rate_limit") ||
      errStr.includes("overloaded") ||
      errStr.includes("quota");
    if (isRateLimited && attempt < retries) {
      const waitMs = 15000 * Math.pow(2, attempt); // 15s, 30s, 60s, 120s
      process.stdout.write(`[rate limited, waiting ${fmtMs(waitMs)}] `);
      await new Promise((r) => setTimeout(r, waitMs));
      attempt++;
      continue;
    }

    const err = new Error(data?.error || `${endpoint} failed (${res.status})`);
    err.status = res.status;
    err.data = data;
    throw err;
  }
}

const OUT_PATH = path.join(__dirname, "..", "public", "sample-analysis.json");

function writeOut(payload) {
  fs.writeFileSync(OUT_PATH, JSON.stringify(payload, null, 2));
}

function fmtMs(ms) {
  if (ms < 1000) return `${ms}ms`;
  const s = ms / 1000;
  if (s < 60) return `${s.toFixed(1)}s`;
  const m = Math.floor(s / 60);
  const rs = (s - m * 60).toFixed(1);
  return `${m}m${rs}s`;
}

// Load existing cache if present, migrating v2 (single-depth, flat) to
// v3 (depths-keyed). Returns a v3 payload ready to be appended to.
function loadOrInitPayload() {
  if (!fs.existsSync(OUT_PATH)) {
    return {
      version: 3,
      generatedAt: new Date().toISOString(),
      query: SAMPLE_QUERY,
      videoId: SAMPLE_VIDEO_ID,
      depths: {},
    };
  }
  let existing;
  try {
    existing = JSON.parse(fs.readFileSync(OUT_PATH, "utf-8"));
  } catch {
    console.log("  (existing cache unreadable, starting fresh)");
    return {
      version: 3,
      generatedAt: new Date().toISOString(),
      query: SAMPLE_QUERY,
      videoId: SAMPLE_VIDEO_ID,
      depths: {},
    };
  }
  if (existing.version === 3 && existing.depths) {
    console.log(`  loaded v3 cache with depths: ${Object.keys(existing.depths).join(", ") || "none"}`);
    existing.generatedAt = new Date().toISOString();
    return existing;
  }
  if (existing.version === 2 && existing.graphData && existing.analyses) {
    const oldDepth = String(existing.depth || 2);
    console.log(`  migrating v2 cache (depth ${oldDepth}) to v3 structure`);
    return {
      version: 3,
      generatedAt: new Date().toISOString(),
      query: existing.query || SAMPLE_QUERY,
      videoId: existing.videoId || SAMPLE_VIDEO_ID,
      depths: {
        [oldDepth]: {
          graphData: existing.graphData,
          statsByVideoId: existing.statsByVideoId || {},
          analyses: existing.analyses || {},
        },
      },
    };
  }
  console.log("  (existing cache has unknown structure, starting fresh)");
  return {
    version: 3,
    generatedAt: new Date().toISOString(),
    query: SAMPLE_QUERY,
    videoId: SAMPLE_VIDEO_ID,
    depths: {},
  };
}

async function main() {
  const totalStart = Date.now();
  console.log(`Hitting ${BASE}`);
  console.log("Tip: keep \`npm run dev\` running in another terminal");
  console.log(`Computing depths: ${SAMPLE_DEPTHS.join(", ")}`);
  console.log(`Loading existing cache from ${OUT_PATH}`);

  const payload = loadOrInitPayload();
  writeOut(payload);
  console.log("");

  for (const depth of SAMPLE_DEPTHS) {
    const depthStart = Date.now();
    console.log(`\n========================================`);
    console.log(`DEPTH ${depth}`);
    console.log(`========================================`);

    // Reuse cached graphData + stats if they already exist so we don't
    // re-discover (which would change the video set and invalidate
    // previously-good cached analyses for this depth).
    const existing = payload.depths[String(depth)];
    const hasCachedGraph =
      existing?.graphData &&
      existing?.statsByVideoId &&
      Object.keys(existing.statsByVideoId).length > 0;

    let graphData;
    let statsByVideoId;

    if (hasCachedGraph) {
      console.log(`  [skip 1+2] reusing cached graphData + stats (${Object.keys(existing.statsByVideoId).length} videos)`);
      graphData = existing.graphData;
      statsByVideoId = existing.statsByVideoId;
    } else {
      // Step 1: Discover
      const discoverStart = Date.now();
      console.log(`[1/3] Discover (depth ${depth})`);
      try {
        graphData = await post("/api/yt-analysis/discover", {
          searchQuery: SAMPLE_QUERY,
          depth,
        });
      } catch (err) {
        console.log(`  FAILED in ${fmtMs(Date.now() - discoverStart)}: ${err.message}. Skipping depth ${depth}.`);
        continue;
      }
      console.log(`  ${graphData.totalVideos} videos, ${graphData.totalEdges} edges, ${graphData.communities.length} communities`);
      console.log(`  ${graphData.selectedVideos.length} selected for comparison`);
      console.log(`  discover took ${fmtMs(Date.now() - discoverStart)}`);

      // Step 2: Stats per comparison video
      const statsStart = Date.now();
      console.log(`[2/3] Stats per comparison video`);
      statsByVideoId = {};
      for (let i = 0; i < graphData.selectedVideos.length; i++) {
        const comp = graphData.selectedVideos[i];
        const t0 = Date.now();
        process.stdout.write(`  [${i + 1}/${graphData.selectedVideos.length}] ${comp.id} ... `);
        try {
          const stats = await post("/api/yt-analysis/stats", { videoId: comp.id });
          statsByVideoId[comp.id] = stats;
          console.log(`ok (${fmtMs(Date.now() - t0)})`);
        } catch (err) {
          console.log(`fallback in ${fmtMs(Date.now() - t0)} (${err.message.slice(0, 60)})`);
          statsByVideoId[comp.id] = { weight: 1 };
        }
      }
      console.log(`  stats took ${fmtMs(Date.now() - statsStart)}`);
    }

    // Save checkpoint - preserve existing analyses if any
    const preservedAnalyses = existing?.analyses || {};
    payload.depths[String(depth)] = { graphData, statsByVideoId, analyses: preservedAnalyses };
    writeOut(payload);

    // Step 3: Analyze for each combo (skip combos that already have enough
    // results from a previous run, to avoid rebuilding working data)
    const analysesStart = Date.now();
    const MIN_ACCEPTABLE = 10;
    const SKIP_COMPLETE = process.env.SKIP_COMPLETE !== "0";
    console.log(`[3/3] Analyze for each (LLM x preset) combo`);
    for (const combo of COMBOS) {
      const comboStart = Date.now();
      const key = `${combo.provider}_${combo.preset}`;
      const existing = payload.depths[String(depth)]?.analyses?.[key];
      if (SKIP_COMPLETE && existing && existing.length >= MIN_ACCEPTABLE) {
        console.log(`\n  -> depth=${depth} ${key}: skipping (already has ${existing.length} cached results)`);
        continue;
      }
      console.log(`\n  -> depth=${depth} ${key} (${combo.params.length} params)`);
      const results = [];
      for (let i = 0; i < graphData.selectedVideos.length; i++) {
        const comp = graphData.selectedVideos[i];
        const t0 = Date.now();
        process.stdout.write(`    [${i + 1}/${graphData.selectedVideos.length}] ${comp.title.slice(0, 45)} ... `);
        try {
          const result = await post("/api/yt-analysis/analyze", {
            userVideoId: SAMPLE_VIDEO_ID,
            comparisonVideoId: comp.id,
            userTitle: SAMPLE_QUERY,
            comparisonTitle: comp.title,
            llmProvider: combo.provider,
            parameters: combo.params,
          });
          results.push(result);
          console.log(`ok (${fmtMs(Date.now() - t0)})`);
        } catch (err) {
          const reason = err.data?.errorType === "user_transcript"
            ? "USER VIDEO HAS NO TRANSCRIPT (fatal)"
            : err.data?.errorType === "comparison_transcript"
            ? "no comparison transcript"
            : err.message.slice(0, 80);
          console.log(`skip in ${fmtMs(Date.now() - t0)} (${reason})`);
          if (err.data?.errorType === "user_transcript") {
            console.error("\n  FATAL: the sample user video has no fetchable transcript. Aborting.");
            process.exit(1);
          }
        }
      }
      payload.depths[String(depth)].analyses[key] = results;
      writeOut(payload); // checkpoint after each combo
      console.log(`  depth=${depth} ${key}: ${results.length}/${graphData.selectedVideos.length} successful, took ${fmtMs(Date.now() - comboStart)}`);
    }
    console.log(`\n  all combos for depth ${depth} took ${fmtMs(Date.now() - analysesStart)}`);
    console.log(`  DEPTH ${depth} TOTAL: ${fmtMs(Date.now() - depthStart)}`);
  }

  console.log(`\n\nDone in ${fmtMs(Date.now() - totalStart)}. Wrote ${OUT_PATH}`);
  console.log(`File size: ${(fs.statSync(OUT_PATH).size / 1024).toFixed(1)} KB`);
  console.log("\nFull summary:");
  for (const depth of Object.keys(payload.depths).sort()) {
    console.log(`  depth=${depth}:`);
    for (const key of Object.keys(payload.depths[depth].analyses)) {
      console.log(`    ${key}: ${payload.depths[depth].analyses[key].length} comparisons`);
    }
  }
}

main().catch((err) => {
  console.error("\nFAILED:", err.message);
  if (err.data) console.error("Server response:", JSON.stringify(err.data, null, 2));
  process.exit(1);
});
