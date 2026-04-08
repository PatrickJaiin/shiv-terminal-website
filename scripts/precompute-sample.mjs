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
const SAMPLE_DEPTH = 2;

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

async function post(endpoint, body) {
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
  if (!res.ok) {
    const err = new Error(data?.error || `${endpoint} failed (${res.status})`);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

const OUT_PATH = path.join(__dirname, "..", "public", "sample-analysis.json");

function writeOut(payload) {
  fs.writeFileSync(OUT_PATH, JSON.stringify(payload, null, 2));
}

async function main() {
  console.log(`Hitting ${BASE}`);
  console.log("Tip: keep \`npm run dev\` running in another terminal\n");

  // Step 1: Discover (shared across all combos)
  console.log("[1/3] Discover");
  const graphData = await post("/api/yt-analysis/discover", {
    searchQuery: SAMPLE_QUERY,
    depth: SAMPLE_DEPTH,
  });
  console.log(`  ${graphData.totalVideos} videos, ${graphData.totalEdges} edges, ${graphData.communities.length} communities`);
  console.log(`  ${graphData.selectedVideos.length} selected for comparison\n`);

  // Step 2: Stats (shared across all combos, keyed by videoId)
  console.log("[2/3] Stats per comparison video");
  const statsByVideoId = {};
  for (let i = 0; i < graphData.selectedVideos.length; i++) {
    const comp = graphData.selectedVideos[i];
    process.stdout.write(`  [${i + 1}/${graphData.selectedVideos.length}] ${comp.id} ... `);
    try {
      const stats = await post("/api/yt-analysis/stats", { videoId: comp.id });
      statsByVideoId[comp.id] = stats;
      console.log("ok");
    } catch (err) {
      console.log(`fallback (${err.message.slice(0, 80)})`);
      statsByVideoId[comp.id] = { weight: 1 };
    }
  }
  console.log("");

  // Initial write so a partial result exists if step 3 crashes
  const payload = {
    version: 2,
    generatedAt: new Date().toISOString(),
    query: SAMPLE_QUERY,
    videoId: SAMPLE_VIDEO_ID,
    depth: SAMPLE_DEPTH,
    graphData,
    statsByVideoId,
    analyses: {},
  };
  writeOut(payload);

  // Step 3: Analyze for each combo
  console.log("[3/3] Analyze for each (LLM x preset) combo");
  for (const combo of COMBOS) {
    const key = `${combo.provider}_${combo.preset}`;
    console.log(`\n  -> ${key} (${combo.params.length} params)`);
    const results = [];
    for (let i = 0; i < graphData.selectedVideos.length; i++) {
      const comp = graphData.selectedVideos[i];
      process.stdout.write(`    [${i + 1}/${graphData.selectedVideos.length}] ${comp.title.slice(0, 50)} ... `);
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
        console.log("ok");
      } catch (err) {
        const reason = err.data?.errorType === "user_transcript"
          ? "USER VIDEO HAS NO TRANSCRIPT (fatal)"
          : err.data?.errorType === "comparison_transcript"
          ? "no comparison transcript"
          : err.message.slice(0, 80);
        console.log(`skip (${reason})`);
        if (err.data?.errorType === "user_transcript") {
          console.error("\n  FATAL: the sample user video has no fetchable transcript. Aborting.");
          process.exit(1);
        }
      }
    }
    payload.analyses[key] = results;
    writeOut(payload); // incremental save after each combo
    console.log(`  ${key}: ${results.length}/${graphData.selectedVideos.length} successful`);
  }

  console.log(`\nDone. Wrote ${OUT_PATH}`);
  console.log(`File size: ${(fs.statSync(OUT_PATH).size / 1024).toFixed(1)} KB`);
  console.log("\nCombo summary:");
  for (const key of Object.keys(payload.analyses)) {
    console.log(`  ${key}: ${payload.analyses[key].length} comparisons`);
  }
}

main().catch((err) => {
  console.error("\nFAILED:", err.message);
  if (err.data) console.error("Server response:", JSON.stringify(err.data, null, 2));
  process.exit(1);
});
