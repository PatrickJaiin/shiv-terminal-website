import { useState, useRef, useEffect, useCallback } from "react";
import Head from "next/head";
import Link from "next/link";
import Navbar from "../../components/Navbar";
import Footer from "../../components/Footer";

// ─── constants ───────────────────────────────────────────────

const COMMUNITY_COLORS = [
  "#a855f7", "#22c55e", "#f97316", "#ec4899", "#3b82f6",
  "#ef4444", "#14b8a6", "#eab308", "#8b5cf6", "#06b6d4",
  "#f43f5e", "#84cc16", "#d946ef", "#0ea5e9", "#f59e0b",
];

const PRESET_YOUTUBE = {
  name: "YouTube Optimization",
  description: "Parameters that map to YouTube algorithm signals",
  params: [
    { key: "hookStrength", label: "Hook Strength", description: "How engaging and attention-grabbing the opening 30 seconds are -does it create curiosity or promise value immediately", scale: "0-100", enabled: true },
    { key: "informationDensity", label: "Information Density", description: "Amount of useful, actionable information per minute of content -high density keeps watch time up", scale: "0-100", enabled: true },
    { key: "narrativeStructure", label: "Narrative Structure", description: "Clarity of story arc -setup, development, payoff -does it have a logical flow that drives completion", scale: "0-100", enabled: true },
    { key: "retentionLanguage", label: "Retention Language", description: "Use of curiosity gaps, teasers, open loops, pattern interrupts, and 'but wait' moments that keep viewers watching", scale: "0-100", enabled: true },
    { key: "seoOptimization", label: "SEO & Keyword Usage", description: "How well the spoken content covers search-relevant keywords and phrases that match the title topic", scale: "0-100", enabled: true },
    { key: "emotionalEngagement", label: "Emotional Engagement", description: "Emotional peaks and valleys throughout -humor, surprise, empathy, excitement -drives likes and shares", scale: "0-100", enabled: true },
    { key: "clarity", label: "Clarity of Explanation", description: "How well complex concepts are broken down -use of analogies, examples, step-by-step -affects satisfaction", scale: "0-100", enabled: true },
    { key: "pacing", label: "Pacing", description: "Speed of content delivery -is it well-paced or does it drag/rush -affects audience retention curve", scale: "0-100", enabled: true },
    { key: "callToAction", label: "Call to Action", description: "Presence and quality of subscribe, like, comment prompts -drives engagement metrics YouTube tracks", scale: "0-100", enabled: true },
    { key: "shareability", label: "Shareability", description: "Would someone send this to a friend -unique insights, surprising facts, quotable moments", scale: "0-100", enabled: true },
    { key: "authority", label: "Authority & Credibility", description: "Does the speaker sound knowledgeable, cite sources, demonstrate expertise -affects trust signals", scale: "0-100", enabled: true },
    { key: "productionQuality", label: "Script Quality", description: "Tightness of script -minimal filler words, repetition, tangents -polished vs rambling delivery", scale: "0-100", enabled: true },
  ],
};

const PRESET_RESEARCH = {
  name: "Original Research (2023)",
  description: "The 12 linguistic parameters from the published paper",
  params: [
    { key: "readability", label: "Readability", description: "Overall readability score", scale: "0-100, higher = more readable", enabled: true },
    { key: "fleschKincaid", label: "Flesch-Kincaid Grade", description: "Flesch-Kincaid grade level -education level needed to understand the text", scale: "1-20", enabled: true },
    { key: "colemanLiau", label: "Coleman-Liau Index", description: "Coleman-Liau reading difficulty metric based on sentence and word structure", scale: "1-20", enabled: true },
    { key: "lexicalDensity", label: "Lexical Density", description: "Percentage of content-bearing words vs total words", scale: "0-100", enabled: true },
    { key: "cohesion", label: "Cohesion", description: "Flow and connectivity of ideas throughout the transcript", scale: "0-100", enabled: true },
    { key: "sentiment", label: "Sentiment Analysis", description: "Emotional positivity and tone of the content", scale: "0-100", enabled: true },
    { key: "keywordFrequency", label: "Keyword Frequency", description: "Density and frequency of topic-relevant keywords", scale: "0-100", enabled: true },
    { key: "relevance", label: "Relevance to Title", description: "How well the spoken content matches the video title", scale: "0-100", enabled: true },
    { key: "easiness", label: "Ease of Understanding", description: "How easy the content is to follow and comprehend for a general audience", scale: "0-100", enabled: true },
    { key: "technicality", label: "Technicality", description: "Level of technical depth and specialized knowledge required", scale: "0-100", enabled: true },
    { key: "jargon", label: "Jargon Usage", description: "Amount of domain-specific or specialized terminology used", scale: "0-100", enabled: true },
  ],
};

const PRESETS = { youtube: PRESET_YOUTUBE, research: PRESET_RESEARCH };

function extractVideoId(input) {
  if (!input) return null;
  // Handle full URLs
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/,
    /^([a-zA-Z0-9_-]{11})$/,
  ];
  for (const p of patterns) {
    const m = input.match(p);
    if (m) return m[1];
  }
  return null;
}

// ─── local components ────────────────────────────────────────

function GraphCanvas({ data }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    if (!data || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    const ctx = canvas.getContext("2d");
    ctx.scale(dpr, dpr);
    const w = rect.width;
    const h = rect.height;

    // Padding
    const pad = 30;
    const drawW = w - pad * 2;
    const drawH = h - pad * 2;

    ctx.clearRect(0, 0, w, h);

    // Background
    ctx.fillStyle = "#0a0a0f";
    ctx.fillRect(0, 0, w, h);

    const nodeMap = new Map(data.nodes.map((n) => [n.id, n]));

    // Draw edges
    ctx.globalAlpha = 0.06;
    ctx.strokeStyle = "#8888aa";
    ctx.lineWidth = 0.5;
    for (const edge of data.edges) {
      const s = nodeMap.get(edge.source);
      const t = nodeMap.get(edge.target);
      if (!s || !t) continue;
      ctx.beginPath();
      ctx.moveTo(pad + s.x * drawW, pad + s.y * drawH);
      ctx.lineTo(pad + t.x * drawW, pad + t.y * drawH);
      ctx.stroke();
    }

    // Draw nodes
    const maxDeg = Math.max(...data.nodes.map((n) => n.degree), 1);
    for (const node of data.nodes) {
      const x = pad + node.x * drawW;
      const y = pad + node.y * drawH;
      const radius = 2 + (node.degree / maxDeg) * 10;
      const color = COMMUNITY_COLORS[node.community % COMMUNITY_COLORS.length];

      ctx.globalAlpha = node.selected ? 1 : 0.7;
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();

      if (node.selected) {
        ctx.strokeStyle = "#fff";
        ctx.lineWidth = 2;
        ctx.stroke();
        // Label
        ctx.globalAlpha = 1;
        ctx.fillStyle = "#fff";
        ctx.font = "10px Inter, system-ui, sans-serif";
        ctx.textAlign = "center";
        const label = node.title.length > 30 ? node.title.slice(0, 28) + "..." : node.title;
        ctx.fillText(label, x, y - radius - 5);
      }
    }

    ctx.globalAlpha = 1;
  }, [data]);

  return (
    <canvas
      ref={canvasRef}
      className="w-full rounded-lg border border-gray-800"
      style={{ height: 420, background: "#0a0a0f" }}
    />
  );
}

function ParameterBar({ label, data }) {
  if (!data) return null;
  const { yours, theirs, diff, relative } = data;
  const pct = Math.max(0, Math.min(100, relative));
  const color = diff > 5 ? "bg-emerald-500" : diff > -5 ? "bg-yellow-500" : "bg-red-500";
  const sign = diff > 0 ? "+" : "";
  return (
    <div className="mb-3">
      <div className="flex items-center justify-between mb-1">
        <span className="text-sm font-medium text-gray-700">{label}</span>
        <div className="flex items-center gap-3 text-xs">
          <span className="text-blue-600 font-semibold">You: {yours}</span>
          <span className="text-gray-400">vs</span>
          <span className="text-gray-500">Avg: {theirs}</span>
          <span
            className={`font-bold ${
              diff > 0 ? "text-emerald-600" : diff < 0 ? "text-red-500" : "text-gray-400"
            }`}
          >
            ({sign}{diff})
          </span>
        </div>
      </div>
      <div className="flex-1 bg-gray-100 rounded-full h-5 relative overflow-hidden">
        {/* Center line at 50% */}
        <div className="absolute left-1/2 top-0 bottom-0 w-px bg-gray-300 z-10" />
        <div
          className={`${color} h-full rounded-full transition-all duration-1000 ease-out`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function PipelineStep({ number, title, subtitle, status, detail }) {
  const bg =
    status === "done"
      ? "bg-emerald-600"
      : status === "active"
      ? "bg-blue-600 animate-pulse"
      : "bg-gray-300";
  return (
    <div className="flex gap-4">
      <div className="flex flex-col items-center">
        <div
          className={`w-9 h-9 rounded-full ${bg} text-white flex items-center justify-center text-sm font-bold flex-shrink-0`}
        >
          {status === "done" ? "\u2713" : number}
        </div>
        {number < 4 && <div className="w-0.5 flex-1 bg-gray-200 mt-1" />}
      </div>
      <div className="pb-6">
        <p className="font-semibold text-gray-900 text-sm">{title}</p>
        <p className="text-xs text-gray-500 mt-0.5">{subtitle}</p>
        {detail && (
          <p className="text-xs text-gray-400 mt-1 font-mono">{detail}</p>
        )}
      </div>
    </div>
  );
}

// ─── scoring logic ───────────────────────────────────────────

function computeFinalScores(analysisResults, weights, activeParamKeys) {
  const scores = {};

  for (const param of activeParamKeys) {
    const userScores = analysisResults.map((r) => r.text1[param] ?? 50);
    const compScores = analysisResults.map((r) => r.text2[param] ?? 50);
    const absWeights = weights.map((w) => Math.abs(w) || 1);
    const totalWeight = absWeights.reduce((a, b) => a + b, 0);

    // Weighted average of user's scores across all comparisons
    const userAvg =
      userScores.reduce((sum, s, i) => sum + s * absWeights[i], 0) / totalWeight;
    // Weighted average of comparison videos' scores
    const compAvg =
      compScores.reduce((sum, s, i) => sum + s * absWeights[i], 0) / totalWeight;

    // Relative score: how your video compares (0-100 scale centered at 50)
    // If your score equals the average comparison, you get 50
    // Better → above 50, worse → below 50
    const diff = userAvg - compAvg;
    const relative = Math.max(0, Math.min(100, 50 + diff));

    scores[param] = {
      yours: Math.round(userAvg * 10) / 10,
      theirs: Math.round(compAvg * 10) / 10,
      diff: Math.round(diff * 10) / 10,
      relative,
    };
  }

  return scores;
}

// ─── recommendations logic ──────────────────────────────────

const RECOMMENDATIONS = {
  hookStrength: {
    low: "Your opening is weak -try starting with a surprising fact, bold claim, or direct question in the first 10 seconds. Top creators hook viewers before the intro even plays.",
    high: "Your hook is strong -viewers are staying past the first 30 seconds. Keep this energy.",
  },
  informationDensity: {
    low: "Your video has too much filler relative to the competition. Cut tangents, tighten scripts, and aim for one valuable insight per minute minimum.",
    high: "Great information density -viewers feel like they're learning something every minute.",
  },
  narrativeStructure: {
    low: "Your video lacks a clear story arc. Try: setup (the problem) → development (the exploration) → payoff (the answer). Give viewers a reason to stay till the end.",
    high: "Strong narrative flow -your content has a clear beginning, middle, and end.",
  },
  retentionLanguage: {
    low: "You're missing retention hooks. Add phrases like 'but here's where it gets interesting', 'the part nobody talks about', or 'wait till you see this' to create curiosity gaps.",
    high: "You're using retention language effectively -open loops and teasers are keeping viewers engaged.",
  },
  seoOptimization: {
    low: "Your spoken content doesn't match what people search for. Naturally weave your target keywords into the first 2 minutes and throughout the video.",
    high: "Good keyword coverage -your spoken content aligns well with search intent.",
  },
  emotionalEngagement: {
    low: "Your content is too flat emotionally. Add moments of humor, surprise, or genuine excitement. Emotional peaks drive likes and shares.",
    high: "Strong emotional engagement -your content creates moments people react to.",
  },
  clarity: {
    low: "Your explanations are harder to follow than the competition. Use more analogies, visual language, and step-by-step breakdowns. Pretend you're explaining to a smart friend.",
    high: "Excellent clarity -complex ideas are well broken down for your audience.",
  },
  pacing: {
    low: "Your pacing is off -either rushing through key points or dragging on segments. Watch your retention analytics and trim where viewers drop off.",
    high: "Well-paced content -you maintain a rhythm that keeps viewers engaged without exhausting them.",
  },
  callToAction: {
    low: "You're leaving engagement on the table. Add a natural subscribe/like prompt early (not just at the end), and ask a specific question to drive comments.",
    high: "Effective CTAs -you're converting viewers into subscribers and commenters.",
  },
  shareability: {
    low: "Nothing in your video makes someone think 'I need to send this to someone.' Add a unique insight, surprising statistic, or quotable moment.",
    high: "High shareability -your content has moments people want to share.",
  },
  authority: {
    low: "You sound less authoritative than competitors. Cite specific sources, share personal experience, or reference data to build credibility.",
    high: "Strong authority signals -viewers trust your expertise on this topic.",
  },
  productionQuality: {
    low: "Your script has too much rambling or filler. Write tighter -every sentence should earn its place. Read it aloud and cut anything that doesn't add value.",
    high: "Clean, polished script with minimal filler -professional quality.",
  },
  readability: {
    low: "Your transcript is harder to read than competitors. Use shorter sentences, simpler words, and more pauses.",
    high: "Great readability -your speech is clear and easy to follow.",
  },
  fleschKincaid: {
    low: "Your content requires a higher reading level than competitors. Simplify vocabulary and sentence structure for broader appeal.",
    high: "Appropriate complexity level for your audience.",
  },
  colemanLiau: {
    low: "Coleman-Liau index suggests your content is more complex. Consider shorter words and sentences.",
    high: "Good readability metrics -your content is accessible.",
  },
  lexicalDensity: {
    low: "Low lexical density -you have a lot of filler words. Tighten your script to increase the ratio of meaningful content words.",
    high: "Good balance of content words -your speech is information-rich.",
  },
  cohesion: {
    low: "Your ideas feel disconnected. Add transition phrases and make sure each point flows logically to the next.",
    high: "Strong cohesion -your ideas connect smoothly throughout.",
  },
  sentiment: {
    low: "Your tone is more negative or neutral than top performers. A more positive, energetic delivery can boost engagement.",
    high: "Positive, engaging tone that resonates with viewers.",
  },
  keywordFrequency: {
    low: "You're not using topic-relevant keywords enough. Work your main keywords naturally into your speech more often.",
    high: "Good keyword coverage for search optimization.",
  },
  relevance: {
    low: "Your content drifts from the title topic. Make sure the first and last minutes directly address the promise in your title.",
    high: "Excellent title-content alignment -you deliver what you promise.",
  },
  easiness: {
    low: "Your content is harder to understand than competitors targeting the same audience. Break complex ideas into smaller steps.",
    high: "Very accessible content -easy for your target audience to follow.",
  },
  technicality: {
    low: "Less technical depth than competitors. If your audience expects depth, add more specific details, data, or technical explanations.",
    high: "Strong technical depth -you're providing the detail your audience wants.",
  },
  jargon: {
    low: "Less specialized terminology than competitors. If you're targeting experts, don't shy away from domain-specific language.",
    high: "Appropriate use of domain terminology for your audience.",
  },
};

// ─── cost estimation ────────────────────────────────────────

// Approx comparison videos selected by the discover step at each depth
// (capped by maxTotal=15 in discover.js, but we estimate roughly)
const COMPARISONS_PER_DEPTH = { 1: 8, 2: 12, 3: 15, 4: 15, 5: 15 };

// Provider pricing per 1M tokens (USD) - input / output
const PROVIDER_PRICING = {
  claude: { in: 3.0, out: 15.0, model: "Claude Sonnet 4.6" },
  gemini: { in: 0.10, out: 0.40, model: "Gemini 3.1 Flash Lite (preview)" },
  sarvam: { in: 0.0, out: 0.0, model: "Sarvam (free tier)" },
};

// Approx token counts per LLM call
// Sarvam uses 3000 char transcripts, others use 12000 chars
// Rule of thumb: 1 token ≈ 4 chars
function estimateTokensPerCall(provider, paramCount) {
  const transcriptChars = provider === "sarvam" ? 3000 : 12000;
  // Two transcripts + instructions + parameter descriptions
  const inputChars = transcriptChars * 2 + 500 + paramCount * 80;
  const inputTokens = Math.ceil(inputChars / 4);
  // Output: ~30 tokens per parameter (two scores per param) + JSON overhead
  const outputTokens = paramCount * 60 + 100;
  return { inputTokens, outputTokens };
}

function estimateCost(provider, depth, paramCount) {
  const calls = COMPARISONS_PER_DEPTH[depth] || 12;
  const { inputTokens, outputTokens } = estimateTokensPerCall(provider, paramCount);
  const totalInput = inputTokens * calls;
  const totalOutput = outputTokens * calls;
  const pricing = PROVIDER_PRICING[provider] || PROVIDER_PRICING.claude;
  const cost = (totalInput / 1_000_000) * pricing.in + (totalOutput / 1_000_000) * pricing.out;
  // YouTube API quota: 100 units per search, ~12-25 searches at depth 2+, ~1 unit per video stats
  const ytQuota = depth === 1 ? 1100 : depth === 2 ? 2100 : depth === 3 ? 3000 : depth === 4 ? 3800 : 4500;
  return {
    calls,
    totalInput,
    totalOutput,
    cost,
    ytQuota,
    model: pricing.model,
  };
}

function generateRecommendations(finalScores, parameters) {
  const activeParams = parameters.filter((p) => p.enabled && finalScores[p.key]);
  const sorted = activeParams
    .map((p) => ({ ...p, score: finalScores[p.key] }))
    .sort((a, b) => a.score.diff - b.score.diff);

  const weaknesses = sorted.filter((p) => p.score.diff < -2).slice(0, 5);
  const strengths = sorted.filter((p) => p.score.diff > 2).sort((a, b) => b.score.diff - a.score.diff).slice(0, 3);

  return { weaknesses, strengths };
}

// ─── parameter editor ────────────────────────────────────────

function ParameterEditor({ parameters, onChange }) {
  const [showAdd, setShowAdd] = useState(false);
  const [newParam, setNewParam] = useState({ key: "", label: "", description: "", scale: "0-100" });

  const toggle = (idx) => {
    const updated = [...parameters];
    updated[idx] = { ...updated[idx], enabled: !updated[idx].enabled };
    onChange(updated);
  };

  const updateField = (idx, field, value) => {
    const updated = [...parameters];
    updated[idx] = { ...updated[idx], [field]: value };
    onChange(updated);
  };

  const remove = (idx) => onChange(parameters.filter((_, i) => i !== idx));

  const addParam = () => {
    if (!newParam.key || !newParam.label) return;
    const key = newParam.key.replace(/[^a-zA-Z0-9]/g, "");
    onChange([...parameters, { ...newParam, key, enabled: true }]);
    setNewParam({ key: "", label: "", description: "", scale: "0-100" });
    setShowAdd(false);
  };

  return (
    <div className="space-y-2">
      {parameters.map((p, i) => (
        <div
          key={p.key}
          className={`flex items-start gap-3 border rounded-lg p-3 transition-all ${
            p.enabled ? "border-gray-200 bg-white" : "border-gray-100 bg-gray-50 opacity-60"
          }`}
        >
          <button
            onClick={() => toggle(i)}
            className={`mt-0.5 w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 transition-colors ${
              p.enabled ? "bg-gray-900 border-gray-900 text-white" : "border-gray-300"
            }`}
          >
            {p.enabled && <span className="text-xs">&#10003;</span>}
          </button>
          <div className="flex-1 min-w-0">
            <input
              value={p.label}
              onChange={(e) => updateField(i, "label", e.target.value)}
              className="text-sm font-semibold text-gray-800 bg-transparent border-none outline-none w-full"
              placeholder="Parameter name"
            />
            <input
              value={p.description}
              onChange={(e) => updateField(i, "description", e.target.value)}
              className="text-xs text-gray-500 bg-transparent border-none outline-none w-full mt-0.5"
              placeholder="Description for the LLM"
            />
            <div className="flex gap-2 mt-1">
              <span className="text-[10px] text-gray-400">key: {p.key}</span>
              <input
                value={p.scale}
                onChange={(e) => updateField(i, "scale", e.target.value)}
                className="text-[10px] text-gray-400 bg-transparent border-none outline-none"
                placeholder="Scale"
              />
            </div>
          </div>
          <button
            onClick={() => remove(i)}
            className="text-gray-300 hover:text-red-500 text-sm mt-0.5"
            title="Remove"
          >
            &#10005;
          </button>
        </div>
      ))}
      {showAdd ? (
        <div className="border border-dashed border-blue-300 rounded-lg p-3 bg-blue-50 space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <input
              value={newParam.key}
              onChange={(e) => setNewParam({ ...newParam, key: e.target.value })}
              placeholder="Key (camelCase)"
              className="text-xs border border-gray-200 rounded px-2 py-1"
            />
            <input
              value={newParam.label}
              onChange={(e) => setNewParam({ ...newParam, label: e.target.value })}
              placeholder="Display name"
              className="text-xs border border-gray-200 rounded px-2 py-1"
            />
          </div>
          <input
            value={newParam.description}
            onChange={(e) => setNewParam({ ...newParam, description: e.target.value })}
            placeholder="Description for LLM (e.g. 'How engaging the hook is in first 30 seconds')"
            className="text-xs border border-gray-200 rounded px-2 py-1 w-full"
          />
          <div className="flex gap-2">
            <input
              value={newParam.scale}
              onChange={(e) => setNewParam({ ...newParam, scale: e.target.value })}
              placeholder="Scale (e.g. 0-100)"
              className="text-xs border border-gray-200 rounded px-2 py-1 flex-1"
            />
            <button onClick={addParam} className="text-xs bg-blue-600 text-white px-3 py-1 rounded font-medium">
              Add
            </button>
            <button onClick={() => setShowAdd(false)} className="text-xs text-gray-500 px-2">
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setShowAdd(true)}
          className="w-full border border-dashed border-gray-300 rounded-lg py-2 text-xs text-gray-500 hover:text-gray-700 hover:border-gray-400 transition-colors"
        >
          + Add custom parameter
        </button>
      )}
    </div>
  );
}

// ─── main page ───────────────────────────────────────────────

export default function YouTubeAlgorithm() {
  // Form state
  const [searchQuery, setSearchQuery] = useState("");
  const [videoUrl, setVideoUrl] = useState("");
  const [llmProvider, setLlmProvider] = useState("claude");
  const [showKeys, setShowKeys] = useState(false);
  const [keys, setKeys] = useState({ youtube: "", anthropic: "", gemini: "", sarvam: "" });
  const [preset, setPreset] = useState("youtube"); // youtube | research | custom
  const [parameters, setParameters] = useState(PRESET_YOUTUBE.params);
  const [showParams, setShowParams] = useState(false);
  const [crawlDepth, setCrawlDepth] = useState(2);

  // Analysis state
  const [phase, setPhase] = useState("idle"); // idle | discovering | analyzing | scoring | done | error
  const [graphData, setGraphData] = useState(null);
  const [analysisResults, setAnalysisResults] = useState([]);
  const [statsResults, setStatsResults] = useState([]);
  const [finalScores, setFinalScores] = useState(null);
  const [progress, setProgress] = useState({ msg: "", current: 0, total: 0 });
  const [error, setError] = useState(null);
  const [log, setLog] = useState([]);

  const addLog = useCallback((msg) => setLog((prev) => [...prev, msg]), []);
  const resultsRef = useRef(null);
  const demoRef = useRef(null);
  const paperRef = useRef(null);

  // ─── main analysis handler ──────────────────────────────

  const handleAnalyze = async () => {
    const videoId = extractVideoId(videoUrl);
    if (!videoId) return setError("Invalid YouTube URL or video ID");
    if (!searchQuery.trim()) return setError("Enter a search query");

    setPhase("discovering");
    setError(null);
    setGraphData(null);
    setAnalysisResults([]);
    setStatsResults([]);
    setFinalScores(null);
    setLog([]);

    try {
      // ── Phase 1: Discover ──
      addLog("Searching YouTube and building recommendation graph...");
      const discoverRes = await fetch("/api/yt-analysis/discover", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          searchQuery,
          depth: crawlDepth,
          youtubeApiKey: keys.youtube || undefined,
        }),
      });
      const discoverData = await discoverRes.json();
      if (!discoverRes.ok) throw new Error(discoverData.error);

      setGraphData(discoverData);
      addLog(
        `Graph built: ${discoverData.totalVideos} videos, ${discoverData.totalEdges} edges, ${discoverData.communities.length} communities`
      );
      addLog(
        `Selected ${discoverData.selectedVideos.length} comparison videos from ${discoverData.communities.length} clusters`
      );

      // ── Phase 2: Analyze each comparison video ──
      setPhase("analyzing");
      const comparisons = discoverData.selectedVideos;
      const results = [];
      const failures = []; // collect per-comparison errors for diagnostics
      let skipCount = 0;

      for (let i = 0; i < comparisons.length; i++) {
        const comp = comparisons[i];
        setProgress({
          msg: `Analyzing: ${comp.title.slice(0, 50)}...`,
          current: i + 1,
          total: comparisons.length,
        });
        addLog(`[${i + 1}/${comparisons.length}] Comparing with "${comp.title.slice(0, 60)}"`);

        try {
          const activeParams = parameters.filter((p) => p.enabled);
          const analyzeRes = await fetch("/api/yt-analysis/analyze", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              userVideoId: videoId,
              comparisonVideoId: comp.id,
              userTitle: searchQuery,
              comparisonTitle: comp.title,
              llmProvider,
              parameters: activeParams.map((p) => ({
                key: p.key,
                description: p.description,
                scale: p.scale,
              })),
              anthropicKey: keys.anthropic || undefined,
              geminiKey: keys.gemini || undefined,
              sarvamKey: keys.sarvam || undefined,
            }),
          });
          // Read body as text first - lets us handle Vercel timeouts and
          // other non-JSON error pages without throwing a cryptic
          // "string did not match expected pattern" parse error.
          const rawBody = await analyzeRes.text();
          let analyzeData;
          try {
            analyzeData = JSON.parse(rawBody);
          } catch {
            const looksLikeTimeout = analyzeRes.status === 504 || /timeout|FUNCTION_INVOCATION/i.test(rawBody);
            const msg = looksLikeTimeout
              ? `Server timeout (status ${analyzeRes.status}). The transcript fetch + LLM call exceeded the function budget.`
              : `Non-JSON response (status ${analyzeRes.status}): ${rawBody.slice(0, 120)}`;
            addLog(`  Failed: ${msg}`);
            failures.push({ kind: "api", error: msg });
            continue;
          }

          if (!analyzeRes.ok) {
            if (analyzeData.errorType === "user_transcript" || analyzeData.fatal) {
              addLog(`  Stopped: your video transcript is not accessible`);
              failures.push({ kind: "userTranscript", error: analyzeData.error || "no transcript" });
              break;
            }
            if (analyzeData.skippable) {
              addLog(`  Skipped: ${analyzeData.error || "no transcript"}`);
              skipCount++;
              failures.push({ kind: "transcript", error: analyzeData.error || "no transcript" });
              continue;
            }
            addLog(`  Error: ${analyzeData.error}`);
            failures.push({ kind: "api", error: analyzeData.error || "unknown error" });
            continue;
          }

          results.push(analyzeData);
          addLog(`  Done -${Object.keys(analyzeData.text1).length} parameters scored`);
        } catch (err) {
          addLog(`  Failed: ${err.message}`);
          failures.push({ kind: "network", error: err.message });
        }
      }

      if (results.length === 0) {
        // Surface the actual underlying error rather than a generic message
        const userTranscriptFails = failures.filter((f) => f.kind === "userTranscript");
        const transcriptFails = failures.filter((f) => f.kind === "transcript").length;
        const apiFails = failures.filter((f) => f.kind === "api");
        const netFails = failures.filter((f) => f.kind === "network");

        let detail;
        if (userTranscriptFails.length > 0) {
          detail = `${userTranscriptFails[0].error} Try enabling captions on your video, testing a video with public English captions, or running the app locally if YouTube is blocking transcript access from your host IP.`;
        } else if (transcriptFails === failures.length && transcriptFails > 0) {
          detail = `All ${transcriptFails} comparison videos had no fetchable transcripts. YouTube often blocks server-side transcript fetching from cloud IPs (Vercel/AWS). Try a different topic with English-captioned videos, or run locally.`;
        } else if (apiFails.length > 0) {
          // Show the first actual API error - this is the most diagnostic
          detail = `LLM/API call failed for ${apiFails.length}/${failures.length} comparisons. First error: "${apiFails[0].error}"`;
        } else if (netFails.length > 0) {
          detail = `Network errors on ${netFails.length}/${failures.length} comparisons. First error: "${netFails[0].error}"`;
        } else {
          detail = "No comparison videos could be analyzed. Check the analysis log above for details.";
        }
        throw new Error(detail);
      }

      setAnalysisResults(results);

      // ── Phase 3: Fetch stats + compute weights ──
      setPhase("scoring");
      addLog("Fetching YouTube statistics and computing weights...");
      const statsArr = [];

      for (const result of results) {
        try {
          const statsRes = await fetch("/api/yt-analysis/stats", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              videoId: result.comparisonVideoId,
              youtubeApiKey: keys.youtube || undefined,
            }),
          });
          const statsData = await statsRes.json();
          if (statsRes.ok) {
            statsArr.push(statsData);
          } else {
            statsArr.push({ weight: 1 }); // fallback weight
          }
        } catch {
          statsArr.push({ weight: 1 });
        }
      }

      setStatsResults(statsArr);

      // ── Phase 4: Compute final scores ──
      const weights = statsArr.map((s) => s.weight);
      const activeParamKeys = parameters.filter((p) => p.enabled).map((p) => p.key);
      const scores = computeFinalScores(results, weights, activeParamKeys);
      setFinalScores(scores);

      addLog("Analysis complete!");
      setPhase("done");

      // Scroll to results
      setTimeout(() => {
        resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 300);
    } catch (err) {
      setError(err.message);
      setPhase("error");
      addLog(`Error: ${err.message}`);
    }
  };

  // ─── phase helpers ──────────────────────────────────────

  const isRunning = ["discovering", "analyzing", "scoring"].includes(phase);
  const stepStatus = (step) => {
    const order = { discovering: 1, analyzing: 2, scoring: 3, done: 4, error: 0 };
    const current = order[phase] || 0;
    if (step < current) return "done";
    if (step === current) return "active";
    return "pending";
  };

  // ─── render ─────────────────────────────────────────────

  return (
    <>
      <Head>
        <title>YouTube Algorithm Analysis -Live Demo -Shiv Gupta</title>
      </Head>

      <Navbar />

      <main className="pt-16">
        <article className="max-w-4xl mx-auto px-6 py-24">
          {/* Back link */}
          <Link
            href="/#projects"
            className="text-sm text-blue-600 hover:underline mb-6 inline-block"
          >
            &larr; Back to Projects
          </Link>

          {/* ─── Hero ─── */}
          <h1 className="text-4xl font-bold text-gray-900 mb-2">
            Reverse Engineering the YouTube Algorithm
          </h1>
          <p className="text-sm text-gray-500 italic mb-4">
            Published as: Parametric Algorithmic Transformer Based Weighted
            YouTube Video Analysis
          </p>
          <div className="flex flex-wrap gap-2 mb-6">
            {["Python", "Graph Analysis", "ForceAtlas2", "LLM-as-Judge", "Research"].map((t) => (
              <span key={t} className="text-xs px-2 py-1 rounded-full bg-gray-100 text-gray-600">
                {t}
              </span>
            ))}
            <span className="text-xs text-gray-400 ml-2">2023 / 2026</span>
          </div>

          <div className="bg-gray-50 border border-gray-200 rounded-lg px-4 py-3 text-xs text-gray-500 mb-6">
            <span className="font-semibold text-gray-700">Original research &amp; paper:</span> 2023 - manual pipeline with Gephi, OpenAI GPT-4, and custom Python scripts.
            <br />
            <span className="font-semibold text-gray-700">Automated live implementation:</span> 2026 - fully automated end-to-end with Claude Code.
          </div>

          <div className="flex flex-wrap gap-4 mb-10">
            <a
              href="https://www.researchgate.net/publication/385962242_Parametric_algorithmic_transformer_based_weighted_YouTube_video_analysis"
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-blue-600 hover:underline font-medium"
            >
              View on ResearchGate
            </a>
            <a
              href="https://drive.google.com/file/d/1SeZ7qM6QHVxB5Ont9-CsWYe0b_WXiWwh/view?usp=sharing"
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-blue-600 hover:underline font-medium"
            >
              Download Paper
            </a>
          </div>

          {/* ─── Description ─── */}
          <div className="prose prose-gray max-w-none mb-6">
            <p className="text-gray-600 leading-relaxed mb-4">
              Crawl YouTube{"'"}s recommendation graph for any search query, detect
              community clusters with ForceAtlas2 + Louvain, then use an LLM judge
              to compare your video{"'"}s transcript against the top recommended videos,
              weighted by engagement metrics.
            </p>
            <p className="text-gray-600 leading-relaxed">
              Enter a search query, paste your video URL, pick an LLM, and get a
              full parametric breakdown of how your content stacks up, plus
              actionable recommendations on what to improve.
            </p>
          </div>

          {/* Big CTA buttons */}
          <div className="flex gap-4 mb-12">
            <button
              onClick={() => demoRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })}
              className="flex-1 bg-gray-900 text-white py-4 rounded-xl font-semibold text-base hover:bg-gray-800 transition-colors text-center"
            >
              Try It Out
            </button>
            <button
              onClick={() => paperRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })}
              className="flex-1 border-2 border-gray-900 text-gray-900 py-4 rounded-xl font-semibold text-base hover:bg-gray-50 transition-colors text-center"
            >
              See Paper
            </button>
          </div>

          {/* ─── Pipeline Overview ─── */}
          <h2 className="text-xl font-semibold text-gray-900 mb-4">How It Works</h2>
          <div className="border border-gray-200 rounded-xl overflow-hidden mb-12">
            <div className="grid grid-cols-4 text-center divide-x divide-gray-200">
              {[
                { step: "1", label: "Crawl", sub: "Search-based graph construction" },
                { step: "2", label: "Cluster", sub: "ForceAtlas2 + Louvain modularity" },
                { step: "3", label: "Analyze", sub: "LLM scores 12 transcript parameters" },
                { step: "4", label: "Score", sub: "Weighted normalization via engagement" },
              ].map((s) => (
                <div key={s.step} className="p-4">
                  <div className="w-8 h-8 rounded-full bg-gray-900 text-white text-sm font-bold flex items-center justify-center mx-auto mb-2">
                    {s.step}
                  </div>
                  <p className="text-sm font-semibold text-gray-900">{s.label}</p>
                  <p className="text-xs text-gray-500 mt-1">{s.sub}</p>
                </div>
              ))}
            </div>
          </div>

          {/* ─── Live Demo ─── */}
          <div ref={demoRef} className="bg-gray-50 border border-gray-200 rounded-xl p-6 mb-12 scroll-mt-24">
            <h2 className="text-xl font-semibold text-gray-900 mb-1">Live Analysis</h2>
            <p className="text-xs text-gray-500 mb-6">
              Requires YouTube Data API key + one LLM API key (server env vars or entered below)
            </p>

            {/* Input form */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Search Query
                </label>
                <input
                  type="text"
                  placeholder='e.g. "How Google Maps work"'
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  disabled={isRunning}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
                />
                <p className="text-xs text-gray-400 mt-1">
                  The topic you want to optimize your video for
                </p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Your Video URL
                </label>
                <input
                  type="text"
                  placeholder="https://youtube.com/watch?v=..."
                  value={videoUrl}
                  onChange={(e) => setVideoUrl(e.target.value)}
                  disabled={isRunning}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
                />
                <p className="text-xs text-gray-400 mt-1">
                  The video you want to compare against recommendations
                </p>
              </div>
            </div>

            {/* LLM provider selector */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                LLM Judge
              </label>
              <div className="flex gap-2">
                {[
                  { id: "claude", label: "Claude", color: "bg-orange-100 text-orange-700 border-orange-300" },
                  { id: "gemini", label: "Gemini", color: "bg-blue-100 text-blue-700 border-blue-300" },
                  { id: "sarvam", label: "Sarvam AI", color: "bg-green-100 text-green-700 border-green-300" },
                ].map((p) => (
                  <button
                    key={p.id}
                    onClick={() => setLlmProvider(p.id)}
                    disabled={isRunning}
                    className={`px-4 py-2 rounded-lg text-sm font-medium border transition-all ${
                      llmProvider === p.id
                        ? `${p.color} ring-2 ring-offset-1 ring-gray-400`
                        : "bg-white text-gray-500 border-gray-200 hover:bg-gray-50"
                    } disabled:opacity-50`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Crawl Depth */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Crawl Depth
              </label>
              <div className="flex items-center gap-2">
                {[
                  { d: 1, est: "~60 videos", label: "Shallow" },
                  { d: 2, est: "~200 videos", label: "Default" },
                  { d: 3, est: "~400 videos", label: "Deep" },
                  { d: 4, est: "~600 videos", label: "Deeper" },
                  { d: 5, est: "~800+ videos", label: "Max" },
                ].map(({ d, est, label }) => (
                  <button
                    key={d}
                    onClick={() => setCrawlDepth(d)}
                    disabled={isRunning}
                    className={`flex-1 py-2 rounded-lg text-center transition-all border ${
                      crawlDepth === d
                        ? "bg-gray-900 text-white border-gray-900"
                        : "bg-white text-gray-500 border-gray-200 hover:bg-gray-50"
                    } disabled:opacity-40`}
                  >
                    <div className="text-sm font-semibold">{d}</div>
                    <div className="text-[10px] opacity-70">{label}</div>
                  </button>
                ))}
              </div>
              <p className="text-xs text-gray-400 mt-1.5">
                Depth {crawlDepth}: {
                  { 1: "~60 videos, fast", 2: "~200 videos, balanced", 3: "~400 videos, thorough", 4: "~600 videos, extensive", 5: "~800+ videos, maximum coverage" }[crawlDepth]
                }
                {crawlDepth >= 4 && " -may take longer and use more API quota"}
              </p>
            </div>

            {/* Parameter Presets */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Analysis Parameters
              </label>
              <div className="flex gap-2 mb-3">
                {[
                  { id: "youtube", label: "YouTube Optimization", color: "bg-red-100 text-red-700 border-red-300" },
                  { id: "research", label: "Original Research", color: "bg-purple-100 text-purple-700 border-purple-300" },
                  { id: "custom", label: "Custom", color: "bg-gray-100 text-gray-700 border-gray-300" },
                ].map((p) => (
                  <button
                    key={p.id}
                    onClick={() => {
                      setPreset(p.id);
                      if (p.id !== "custom") {
                        setParameters(PRESETS[p.id].params.map((param) => ({ ...param })));
                      }
                    }}
                    disabled={isRunning}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                      preset === p.id
                        ? `${p.color} ring-2 ring-offset-1 ring-gray-400`
                        : "bg-white text-gray-500 border-gray-200 hover:bg-gray-50"
                    } disabled:opacity-50`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
              {preset !== "custom" && PRESETS[preset] && (
                <p className="text-xs text-gray-400 mb-2">{PRESETS[preset].description}</p>
              )}
              <button
                onClick={() => setShowParams(!showParams)}
                disabled={isRunning}
                className="text-xs text-gray-500 hover:text-gray-700 flex items-center gap-1"
              >
                <span className="bg-gray-200 px-1.5 py-0.5 rounded font-mono">
                  {parameters.filter((p) => p.enabled).length}
                </span>
                {showParams ? "Hide parameters" : "View / edit parameters"}
              </button>
              {showParams && (
                <div className="mt-3">
                  <ParameterEditor
                    parameters={parameters}
                    onChange={(p) => {
                      setParameters(p);
                      setPreset("custom");
                    }}
                  />
                </div>
              )}
            </div>

            {/* API Keys (collapsible) */}
            <div className="mb-5">
              <button
                onClick={() => setShowKeys(!showKeys)}
                className="text-xs text-gray-500 hover:text-gray-700 underline"
              >
                {showKeys ? "Hide" : "Bring your own"} API keys
              </button>
              {showKeys && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3">
                  {[
                    { key: "youtube", label: "YouTube Data API Key" },
                    { key: "anthropic", label: "Anthropic API Key (Claude)" },
                    { key: "gemini", label: "Google Gemini API Key" },
                    { key: "sarvam", label: "Sarvam AI API Key" },
                  ].map((k) => (
                    <input
                      key={k.key}
                      type="password"
                      placeholder={k.label}
                      value={keys[k.key]}
                      onChange={(e) =>
                        setKeys((prev) => ({ ...prev, [k.key]: e.target.value }))
                      }
                      className="border border-gray-200 rounded-lg px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  ))}
                </div>
              )}
            </div>

            {/* Cost estimate */}
            {(() => {
              const activeParamCount = parameters.filter((p) => p.enabled).length;
              const est = estimateCost(llmProvider, crawlDepth, activeParamCount);
              const costLabel = est.cost === 0
                ? "Free"
                : est.cost < 0.01
                ? "< $0.01"
                : `~$${est.cost.toFixed(2)}`;
              return (
                <div className="mb-4 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3">
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div>
                      <p className="text-xs font-semibold text-amber-900 mb-0.5">
                        Estimated cost: <span className="font-bold">{costLabel}</span>
                      </p>
                      <p className="text-[11px] text-amber-700 leading-snug">
                        ~{est.calls} LLM calls via {est.model} ({(est.totalInput / 1000).toFixed(0)}k in / {(est.totalOutput / 1000).toFixed(1)}k out tokens)
                        {" - "}
                        ~{est.ytQuota} YouTube API quota units
                      </p>
                    </div>
                    <span className="text-[10px] text-amber-600 italic shrink-0">
                      Estimate only - actual usage varies
                    </span>
                  </div>
                </div>
              );
            })()}

            {/* Analyze + Sample buttons */}
            <div className="flex gap-3">
              <button
                onClick={handleAnalyze}
                disabled={isRunning || !searchQuery.trim() || !videoUrl.trim()}
                className="flex-1 bg-gray-900 text-white py-3 rounded-lg font-semibold text-sm hover:bg-gray-800 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {isRunning ? "Analyzing..." : "Analyze Video"}
              </button>
              <button
                onClick={() => {
                  setSearchQuery("How do Google Maps actually works?");
                  setVideoUrl("https://www.youtube.com/watch?v=c6wb9xtH7RM&t=232s");
                }}
                disabled={isRunning}
                className="px-5 py-3 border border-gray-300 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-100 transition-colors disabled:opacity-40"
                title="Fill with sample data from the original paper"
              >
                Sample
              </button>
            </div>

            {error && (
              <div className="mt-4 bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">
                {error}
              </div>
            )}
          </div>

          {/* ─── Progress Pipeline ─── */}
          {phase !== "idle" && (
            <div className="mb-12">
              <h2 className="text-xl font-semibold text-gray-900 mb-4">Progress</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div>
                  <PipelineStep
                    number={1}
                    title="Crawl Recommendation Graph"
                    subtitle="YouTube search → build graph → ForceAtlas2 → Louvain"
                    status={stepStatus(1)}
                    detail={
                      graphData
                        ? `${graphData.totalVideos} nodes, ${graphData.totalEdges} edges, ${graphData.communities.length} communities`
                        : null
                    }
                  />
                  <PipelineStep
                    number={2}
                    title="LLM Transcript Analysis"
                    subtitle={`Compare your video against cluster representatives using ${llmProvider}`}
                    status={stepStatus(2)}
                    detail={
                      phase === "analyzing"
                        ? `${progress.current}/${progress.total}: ${progress.msg}`
                        : analysisResults.length > 0
                        ? `${analysisResults.length} videos compared`
                        : null
                    }
                  />
                  <PipelineStep
                    number={3}
                    title="Weight Computation"
                    subtitle="Popularity * Engagement * Sentiment + Consistency"
                    status={stepStatus(3)}
                    detail={
                      statsResults.length > 0
                        ? `${statsResults.length} weights computed`
                        : null
                    }
                  />
                  <PipelineStep
                    number={4}
                    title="Final Parametric Scores"
                    subtitle="Weighted differences → min-max normalization"
                    status={stepStatus(4)}
                    detail={finalScores ? "Complete" : null}
                  />
                </div>

                {/* Log */}
                <div className="bg-gray-950 rounded-lg p-4 max-h-72 overflow-y-auto">
                  <p className="text-xs text-gray-500 mb-2 font-mono">// analysis log</p>
                  {log.map((line, i) => (
                    <p key={i} className="text-xs text-gray-400 font-mono leading-relaxed">
                      {line}
                    </p>
                  ))}
                  {isRunning && (
                    <span className="inline-block w-2 h-4 bg-gray-400 animate-pulse ml-1" />
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ─── Graph Visualization ─── */}
          {graphData && (
            <div className="mb-12">
              <h2 className="text-xl font-semibold text-gray-900 mb-2">
                Recommendation Graph
              </h2>
              <p className="text-sm text-gray-500 mb-4">
                {graphData.totalVideos} videos, {graphData.communities.length}{" "}
                communities detected. Highlighted nodes = selected comparison
                videos.
              </p>

              <GraphCanvas data={graphData} />

              {/* Community legend */}
              <div className="flex flex-wrap gap-3 mt-4">
                {graphData.communities.map((c) => (
                  <div key={c.id} className="flex items-center gap-1.5">
                    <div
                      className="w-3 h-3 rounded-full"
                      style={{
                        backgroundColor:
                          COMMUNITY_COLORS[c.id % COMMUNITY_COLORS.length],
                      }}
                    />
                    <span className="text-xs text-gray-500">
                      Cluster {c.id} ({c.count})
                    </span>
                  </div>
                ))}
              </div>

              {/* Selected comparison videos */}
              <div className="mt-6">
                <h3 className="text-sm font-semibold text-gray-700 mb-3">
                  Selected Comparison Videos
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  {graphData.selectedVideos.map((v) => (
                    <div
                      key={v.id}
                      className="flex items-center gap-3 border border-gray-200 rounded-lg px-3 py-2 bg-white"
                    >
                      <div
                        className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                        style={{
                          backgroundColor:
                            COMMUNITY_COLORS[v.community % COMMUNITY_COLORS.length],
                        }}
                      />
                      <div className="min-w-0">
                        <p className="text-xs font-medium text-gray-900 truncate">
                          {v.title}
                        </p>
                        <p className="text-xs text-gray-400">{v.channel}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ─── Results ─── */}
          {finalScores && (
            <div ref={resultsRef}>
              {/* Stat cards */}
              <h2 className="text-xl font-semibold text-gray-900 mb-4">
                Parametric Analysis Results
              </h2>
              <p className="text-sm text-gray-500 mb-6">
                How your video compares to YouTube{"'"}s top recommended videos for
                {'"'}{searchQuery}{'"'}, weighted by engagement metrics. Higher
                score = your video outperforms recommendations on that dimension.
              </p>

              {/* Summary cards */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
                {(() => {
                  const vals = Object.values(finalScores);
                  const avgDiff = vals.reduce((a, b) => a + b.diff, 0) / vals.length;
                  const sign = avgDiff > 0 ? "+" : "";
                  return (
                    <div className="bg-white border border-gray-200 rounded-xl p-4 text-center">
                      <div className={`text-2xl font-bold ${avgDiff > 0 ? "text-emerald-600" : avgDiff < 0 ? "text-red-500" : "text-gray-900"}`}>
                        {sign}{avgDiff.toFixed(1)}
                      </div>
                      <div className="text-xs text-gray-500 mt-1">Avg Difference</div>
                    </div>
                  );
                })()}
                <div className="bg-white border border-gray-200 rounded-xl p-4 text-center">
                  <div className="text-2xl font-bold text-emerald-600">
                    {analysisResults.length}
                  </div>
                  <div className="text-xs text-gray-500 mt-1">Videos Compared</div>
                </div>
                <div className="bg-white border border-gray-200 rounded-xl p-4 text-center">
                  <div className="text-2xl font-bold text-blue-600">
                    {Object.keys(finalScores).length}
                  </div>
                  <div className="text-xs text-gray-500 mt-1">Parameters</div>
                </div>
                <div className="bg-white border border-gray-200 rounded-xl p-4 text-center">
                  <div className="text-2xl font-bold text-purple-600">
                    {llmProvider === "claude"
                      ? "Claude"
                      : llmProvider === "gemini"
                      ? "Gemini"
                      : "Sarvam"}
                  </div>
                  <div className="text-xs text-gray-500 mt-1">LLM Judge</div>
                </div>
              </div>

              {/* Parameter bar charts */}
              <div className="bg-white border border-gray-200 rounded-xl p-6 mb-8">
                <h3 className="text-sm font-semibold text-gray-700 mb-4">
                  Parameter Breakdown
                </h3>
                {parameters
                  .filter((p) => p.enabled && finalScores[p.key] !== undefined)
                  .map((p) => (
                    <ParameterBar
                      key={p.key}
                      label={p.label}
                      data={finalScores[p.key]}
                    />
                  ))}
              </div>

              {/* What Should You Do */}
              {(() => {
                const { weaknesses, strengths } = generateRecommendations(finalScores, parameters);
                if (weaknesses.length === 0 && strengths.length === 0) return null;
                return (
                  <div className="bg-white border border-gray-200 rounded-xl p-6 mb-8">
                    <h3 className="text-base font-semibold text-gray-900 mb-1">What Should You Do?</h3>
                    <p className="text-xs text-gray-400 mb-5">Actionable recommendations based on how your video compares to what YouTube is surfacing</p>

                    {weaknesses.length > 0 && (
                      <div className="mb-5">
                        <h4 className="text-sm font-semibold text-red-600 mb-3 flex items-center gap-2">
                          <span className="w-5 h-5 rounded-full bg-red-100 text-red-600 flex items-center justify-center text-xs font-bold">!</span>
                          Fix These ({weaknesses.length})
                        </h4>
                        <div className="space-y-3">
                          {weaknesses.map((p) => {
                            const rec = RECOMMENDATIONS[p.key];
                            const text = rec?.low || `Your ${p.label.toLowerCase()} scores below the competition. Focus on improving this area.`;
                            return (
                              <div key={p.key} className="flex gap-3 items-start bg-red-50 border border-red-100 rounded-lg p-3">
                                <div className="flex-shrink-0 mt-0.5">
                                  <span className={`inline-block text-xs font-bold px-2 py-0.5 rounded ${
                                    p.score.diff < -10 ? "bg-red-600 text-white" : "bg-red-200 text-red-700"
                                  }`}>
                                    {p.score.diff > 0 ? "+" : ""}{p.score.diff}
                                  </span>
                                </div>
                                <div>
                                  <p className="text-sm font-semibold text-gray-800">{p.label}</p>
                                  <p className="text-xs text-gray-600 mt-0.5 leading-relaxed">{text}</p>
                                  <p className="text-[10px] text-gray-400 mt-1">You: {p.score.yours} vs Avg: {p.score.theirs}</p>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {strengths.length > 0 && (
                      <div>
                        <h4 className="text-sm font-semibold text-emerald-600 mb-3 flex items-center gap-2">
                          <span className="w-5 h-5 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center text-xs font-bold">&#10003;</span>
                          Your Strengths ({strengths.length})
                        </h4>
                        <div className="space-y-2">
                          {strengths.map((p) => {
                            const rec = RECOMMENDATIONS[p.key];
                            const text = rec?.high || `Your ${p.label.toLowerCase()} outperforms the competition. Keep it up.`;
                            return (
                              <div key={p.key} className="flex gap-3 items-start bg-emerald-50 border border-emerald-100 rounded-lg p-3">
                                <span className="inline-block text-xs font-bold px-2 py-0.5 rounded bg-emerald-200 text-emerald-700 flex-shrink-0 mt-0.5">
                                  +{p.score.diff}
                                </span>
                                <div>
                                  <p className="text-sm font-semibold text-gray-800">{p.label}</p>
                                  <p className="text-xs text-gray-600 mt-0.5">{text}</p>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* Weight breakdown table */}
              {statsResults.length > 0 && (
                <div className="bg-white border border-gray-200 rounded-xl overflow-hidden mb-8">
                  <div className="px-6 py-4 border-b border-gray-200 bg-gray-50">
                    <h3 className="text-sm font-semibold text-gray-700">
                      Weight Breakdown per Comparison Video
                    </h3>
                    <p className="text-xs text-gray-400 mt-1">
                      W = (Popularity x Engagement x Sentiment) + Consistency, floored
                      via f(x) = -1/x
                    </p>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-gray-200 bg-gray-50 text-gray-500 uppercase tracking-wider">
                          <th className="text-left px-4 py-2">Video</th>
                          <th className="text-right px-4 py-2">Views</th>
                          <th className="text-right px-4 py-2">Engagement</th>
                          <th className="text-right px-4 py-2">Sentiment</th>
                          <th className="text-right px-4 py-2">Consistency</th>
                          <th className="text-right px-4 py-2 font-bold">Weight</th>
                        </tr>
                      </thead>
                      <tbody>
                        {statsResults.map((s, i) => (
                          <tr key={i} className="border-b border-gray-100">
                            <td className="px-4 py-2 text-gray-700 max-w-[200px] truncate">
                              {s.title || analysisResults[i]?.comparisonTitle || s.videoId}
                            </td>
                            <td className="px-4 py-2 text-right text-gray-600">
                              {s.views?.toLocaleString() || "-"}
                            </td>
                            <td className="px-4 py-2 text-right text-gray-600">
                              {s.engagement ?? "-"}
                            </td>
                            <td className="px-4 py-2 text-right text-gray-600">
                              {s.sentiment ?? "-"}
                            </td>
                            <td className="px-4 py-2 text-right text-gray-600">
                              {s.consistency ?? "-"}
                            </td>
                            <td className="px-4 py-2 text-right font-mono font-bold text-gray-900">
                              {s.weight?.toExponential(3) ?? "-"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Raw per-video LLM scores */}
              <details className="mb-12">
                <summary className="text-sm font-medium text-gray-600 cursor-pointer hover:text-gray-900">
                  Show raw LLM scores per comparison video
                </summary>
                <div className="mt-4 space-y-4">
                  {analysisResults.map((r, i) => {
                    const activeParams = parameters.filter((p) => p.enabled && r.text1[p.key] !== undefined);
                    return (
                      <div
                        key={i}
                        className="border border-gray-200 rounded-lg overflow-hidden"
                      >
                        <div className="px-4 py-2 bg-gray-50 border-b border-gray-200">
                          <p className="text-xs font-medium text-gray-700">
                            vs. {r.comparisonTitle}
                          </p>
                        </div>
                        <div className="px-4 py-3 grid grid-cols-2 gap-x-8 gap-y-1 text-xs">
                          {activeParams.map((p) => (
                            <div key={p.key} className="flex justify-between">
                              <span className="text-gray-500">{p.label}</span>
                              <span className="font-mono">
                                <span className="text-blue-600">{r.text1[p.key]}</span>
                                {" vs "}
                                <span className="text-gray-600">{r.text2[p.key]}</span>
                                <span className="text-gray-400 ml-1">
                                  ({r.text1[p.key] - r.text2[p.key] > 0 ? "+" : ""}
                                  {r.text1[p.key] - r.text2[p.key]})
                                </span>
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </details>
            </div>
          )}

          {/* ─── Methodology ─── */}
          <h2 className="text-xl font-semibold text-gray-900 mb-4">Methodology</h2>
          <div className="space-y-4 mb-12">
            <div className="border border-gray-200 rounded-xl overflow-hidden">
              <div className="px-5 py-3 bg-gray-50 border-b border-gray-200">
                <span className="text-xs font-mono font-bold text-gray-900 bg-gray-200 px-2 py-0.5 rounded mr-2">
                  Eq. 1
                </span>
                <span className="font-semibold text-gray-800 text-sm">Weight Allocation</span>
              </div>
              <div className="px-5 py-4">
                <p className="text-sm text-gray-600 font-mono mb-2">
                  W = (Popularity &times; Engagement &times; Sentiment) + Consistency
                </p>
                <div className="grid grid-cols-2 gap-2 text-xs text-gray-500">
                  <p>Popularity = Views &times; Subscribers</p>
                  <p>Engagement = (Likes + Comments) / (2 &times; Views)</p>
                  <p>Sentiment = Likes / Views</p>
                  <p>Consistency = (avgLikes + avgComments + avgViews) / avgViews</p>
                </div>
              </div>
            </div>

            <div className="border border-gray-200 rounded-xl overflow-hidden">
              <div className="px-5 py-3 bg-gray-50 border-b border-gray-200">
                <span className="text-xs font-mono font-bold text-gray-900 bg-gray-200 px-2 py-0.5 rounded mr-2">
                  Eq. 9
                </span>
                <span className="font-semibold text-gray-800 text-sm">Parametric Value Generation</span>
              </div>
              <div className="px-5 py-4">
                <p className="text-sm text-gray-600 font-mono mb-2">
                  P_i = &Sigma; (T1_j &minus; T2_j) &times; W_j
                </p>
                <p className="text-xs text-gray-500">
                  For each parameter, the difference between your video{"'"}s score and each
                  comparison video{"'"}s score is multiplied by that video{"'"}s weight, then
                  standardized via min-max normalization.
                </p>
              </div>
            </div>

            <div className="border border-gray-200 rounded-xl overflow-hidden">
              <div className="px-5 py-3 bg-gray-50 border-b border-gray-200">
                <span className="text-xs font-mono font-bold text-gray-900 bg-gray-200 px-2 py-0.5 rounded mr-2">
                  Eq. 10
                </span>
                <span className="font-semibold text-gray-800 text-sm">Min-Max Standardization</span>
              </div>
              <div className="px-5 py-4">
                <p className="text-sm text-gray-600 font-mono mb-2">
                  f(x) = (X &minus; min) / (max &minus; min)
                </p>
                <p className="text-xs text-gray-500">
                  Normalizes the weighted parametric differences to a 0-100 scale
                  for interpretability.
                </p>
              </div>
            </div>

            <div className="border border-gray-200 rounded-xl overflow-hidden">
              <div className="px-5 py-3 bg-gray-50 border-b border-gray-200">
                <span className="text-xs font-mono font-bold text-gray-900 bg-gray-200 px-2 py-0.5 rounded mr-2">
                  Eq. 11
                </span>
                <span className="font-semibold text-gray-800 text-sm">Flooring Function</span>
              </div>
              <div className="px-5 py-4">
                <p className="text-sm text-gray-600 font-mono mb-2">
                  f(x) = &minus;1/x
                </p>
                <p className="text-xs text-gray-500">
                  Floors weight values to maintain a similar baseline and deviation,
                  ensuring proportional comparison.
                </p>
              </div>
            </div>
          </div>

          {/* ─── Parameter Presets ─── */}
          <h2 className="text-xl font-semibold text-gray-900 mb-4">
            Parameter Presets
          </h2>
          {[PRESET_YOUTUBE, PRESET_RESEARCH].map((pre) => (
            <div key={pre.name} className="mb-8">
              <h3 className="text-sm font-semibold text-gray-700 mb-1">{pre.name}</h3>
              <p className="text-xs text-gray-400 mb-3">{pre.description}</p>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                {pre.params.map((p, i) => (
                  <div
                    key={p.key}
                    className="border border-gray-200 rounded-lg p-3 bg-white"
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <span className="w-5 h-5 rounded-full bg-gray-900 text-white text-[10px] flex items-center justify-center font-bold">
                        {i + 1}
                      </span>
                      <span className="text-xs font-semibold text-gray-800">
                        {p.label}
                      </span>
                    </div>
                    <p className="text-[11px] text-gray-500 leading-relaxed">
                      {p.description}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          ))}

          {/* ─── Paper ─── */}
          <h2 ref={paperRef} className="text-xl font-semibold text-gray-900 mb-4 scroll-mt-24">Paper</h2>
          <div className="border border-gray-200 rounded-lg overflow-hidden bg-gray-50">
            <iframe
              src="https://drive.google.com/file/d/1SeZ7qM6QHVxB5Ont9-CsWYe0b_WXiWwh/preview"
              width="100%"
              height="800"
              allow="autoplay"
              className="border-0"
            />
          </div>
        </article>
      </main>

      <Footer />
    </>
  );
}
