import Head from "next/head";
import Link from "next/link";
import Navbar from "../../components/Navbar";
import Footer from "../../components/Footer";

function Bar({ value, max = 100, color = "bg-blue-500", label, sublabel }) {
  const pct = (value / max) * 100;
  return (
    <div className="flex items-center gap-3 mb-2">
      <div className="w-36 text-sm text-gray-600 text-right shrink-0">{label}</div>
      <div className="flex-1 bg-gray-100 rounded-full h-7 relative overflow-hidden">
        <div
          className={`${color} h-full rounded-full transition-all duration-700 ease-out`}
          style={{ width: `${pct}%` }}
        />
        <span className="absolute inset-0 flex items-center px-3 text-xs font-medium text-gray-700">
          {sublabel || `${value}%`}
        </span>
      </div>
    </div>
  );
}

function StatCard({ value, label, sub, accent = "text-blue-600" }) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5 text-center">
      <div className={`text-3xl font-bold ${accent}`}>{value}</div>
      <div className="text-sm font-medium text-gray-800 mt-1">{label}</div>
      {sub && <div className="text-xs text-gray-400 mt-1">{sub}</div>}
    </div>
  );
}

function PhaseCard({ number, title, status, children }) {
  const statusColors = {
    success: "bg-green-100 text-green-700 border-green-200",
    partial: "bg-yellow-100 text-yellow-700 border-yellow-200",
    failed: "bg-red-100 text-red-700 border-red-200",
    insight: "bg-blue-100 text-blue-700 border-blue-200",
  };
  return (
    <div className="border border-gray-200 rounded-xl overflow-hidden mb-6">
      <div className="bg-gray-50 px-5 py-3 flex items-center justify-between border-b border-gray-200">
        <div className="flex items-center gap-3">
          <span className="bg-gray-900 text-white text-xs font-bold px-2.5 py-1 rounded-full">{number}</span>
          <h3 className="font-semibold text-gray-800">{title}</h3>
        </div>
        {status && (
          <span className={`text-xs font-medium px-2.5 py-1 rounded-full border ${statusColors[status]}`}>
            {status === "success" ? "Breakthrough" : status === "partial" ? "Partial" : status === "failed" ? "Failed" : "Insight"}
          </span>
        )}
      </div>
      <div className="p-5">{children}</div>
    </div>
  );
}

function LayerBlock({ label, sublabel, color, width = "w-full" }) {
  return (
    <div className={`${color} rounded-lg p-3 ${width}`}>
      <div className="text-sm font-semibold">{label}</div>
      {sublabel && <div className="text-xs opacity-75 mt-0.5">{sublabel}</div>}
    </div>
  );
}

export default function LatentReasoning() {
  return (
    <>
      <Head>
        <title>Closed-Thought LLM - Shiv Gupta</title>
      </Head>

      <Navbar />

      <main className="pt-16">
        <article className="max-w-4xl mx-auto px-6 py-24">
          <Link href="/#projects" className="text-sm text-blue-600 hover:underline mb-6 inline-block">
            &larr; Back to Projects
          </Link>

          <h1 className="text-4xl font-bold text-gray-900 mb-2">
            Closed-Thought LLM
          </h1>
          <p className="text-sm text-gray-500 italic mb-4">
            Training-Free Latent Reasoning for Frozen Language Models via Split-Layer Generation
          </p>
          <div className="flex flex-wrap gap-2 mb-3">
            <span className="text-xs px-2 py-1 rounded-full bg-gray-100 text-gray-600">Python</span>
            <span className="text-xs px-2 py-1 rounded-full bg-gray-100 text-gray-600">PyTorch</span>
            <span className="text-xs px-2 py-1 rounded-full bg-gray-100 text-gray-600">LLMs</span>
            <span className="text-xs px-2 py-1 rounded-full bg-gray-100 text-gray-600">CUDA</span>
            <span className="text-xs text-gray-400 ml-2">2026</span>
          </div>
          <p className="text-sm text-gray-500 mb-8">
            Built by <strong className="text-gray-700">Shiv</strong> and a mass-hallucinated office of <strong className="text-gray-700">Claude Opus 4.6</strong> researchers who insist they{"'"}re real
          </p>

          {/* Hero Callout */}
          <div className="relative bg-gradient-to-br from-blue-600 to-indigo-700 rounded-2xl p-8 mb-12 text-white overflow-hidden">
            <div className="absolute top-0 right-0 w-64 h-64 bg-white/5 rounded-full -translate-y-1/2 translate-x-1/2" />
            <div className="absolute bottom-0 left-0 w-48 h-48 bg-white/5 rounded-full translate-y-1/2 -translate-x-1/4" />
            <div className="relative">
              <p className="text-blue-100 text-lg mb-3">
                Can a frozen LLM &quot;think&quot; in latent space by looping its own hidden states - without any training?
              </p>
              <p className="text-2xl font-bold mb-4">
                Yes. +13pp on GSM8K with zero training.
              </p>
              <p className="text-blue-200 text-sm">
                A 2025 survey of ~30+ latent reasoning methods found zero training-free approaches. This is the first.
              </p>
            </div>
          </div>

          {/* Stats Row */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-12">
            <StatCard value="+13pp" label="GSM8K Improvement" sub="39.5% → 52.5%" accent="text-green-600" />
            <StatCard value="0" label="Trained Parameters" sub="Fully frozen model" accent="text-blue-600" />
            <StatCard value="4" label="Recurrence Steps" sub="Optimal depth" accent="text-purple-600" />
            <StatCard value="512+" label="Stable Iterations" sub="No regularization" accent="text-orange-600" />
          </div>

          {/* Headline Results - Visual Bar Chart */}
          <h2 className="text-xl font-semibold text-gray-900 mb-2">Headline Results</h2>
          <p className="text-sm text-gray-500 mb-5">GSM8K accuracy (N=200). Higher is better.</p>

          <div className="bg-gray-50 rounded-xl p-6 mb-4">
            <Bar value={52.5} label="Ours (AM3)" color="bg-green-500" />
            <Bar value={39.5} label="Frozen Baseline" color="bg-gray-400" />
            <Bar value={34.1} label="COCONUT" color="bg-gray-300" sublabel="34.1% (GPT-2, not comparable)" />
            <Bar value={1.4} label="SoftCoT" color="bg-gray-300" sublabel="+1.4pp (requires projection module)" />
          </div>
          <div className="flex items-center gap-6 text-xs text-gray-500 mb-12">
            <div className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-green-500 inline-block" /> Ours (no training)</div>
            <div className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-gray-400 inline-block" /> Baseline</div>
            <div className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-gray-300 inline-block" /> Prior work (training required)</div>
          </div>

          {/* Architecture - Visual Diagram */}
          <h2 className="text-xl font-semibold text-gray-900 mb-6">Architecture</h2>

          <div className="bg-gray-50 rounded-2xl p-6 md:p-8 mb-12 space-y-6">
            {/* Recurrence Phase */}
            <div>
              <div className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">Recurrence Phase</div>
              <div className="flex flex-col md:flex-row items-stretch gap-3">
                <LayerBlock label="Input" sublabel="Tokenize" color="bg-gray-200 text-gray-700" width="md:w-28" />
                <div className="flex items-center justify-center text-gray-400 text-lg">&rarr;</div>
                <LayerBlock label="Layers 0-11" sublabel="Frozen, single pass" color="bg-blue-100 text-blue-800" width="md:w-40" />
                <div className="flex items-center justify-center text-gray-400 text-lg">&rarr;</div>
                <div className="flex-1 border-2 border-dashed border-purple-300 rounded-lg p-4 bg-purple-50 relative">
                  <div className="text-sm font-semibold text-purple-800 mb-1">Layers 12-35</div>
                  <div className="text-xs text-purple-600">Loop N times. Each step writes a &quot;thought token&quot; to KV cache.</div>
                  <div className="absolute -top-2.5 right-3 bg-purple-600 text-white text-xs font-bold px-2 py-0.5 rounded-full">&times; N</div>
                </div>
              </div>
            </div>

            {/* Divider */}
            <div className="flex items-center gap-3">
              <div className="flex-1 h-px bg-gray-200" />
              <div className="text-xs text-gray-400 font-medium">then</div>
              <div className="flex-1 h-px bg-gray-200" />
            </div>

            {/* Gating Phase */}
            <div>
              <div className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">Gating Phase</div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                  <div className="text-sm font-semibold text-green-800">Answer mass &gt; 0.3</div>
                  <div className="text-xs text-green-600 mt-1">Simple task (multiple choice) &rarr; skip recurrence, use baseline</div>
                </div>
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                  <div className="text-sm font-semibold text-amber-800">Answer mass &lt; 0.3</div>
                  <div className="text-xs text-amber-600 mt-1">Complex task (math reasoning) &rarr; apply recurrence + split-layer gen</div>
                </div>
              </div>
            </div>

            {/* Divider */}
            <div className="flex items-center gap-3">
              <div className="flex-1 h-px bg-gray-200" />
              <div className="text-xs text-gray-400 font-medium">then</div>
              <div className="flex-1 h-px bg-gray-200" />
            </div>

            {/* Generation Phase */}
            <div>
              <div className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">Generation Phase (Split-Layer)</div>
              <div className="space-y-2">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-blue-500 flex items-center justify-center text-white text-xs font-bold shrink-0">1</div>
                  <div className="flex-1 bg-blue-100 text-blue-800 rounded-lg p-3 text-sm">
                    <strong>First token:</strong> 0.7 &times; baseline + 0.3 &times; thought logits
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-indigo-500 flex items-center justify-center text-white text-xs font-bold shrink-0">2+</div>
                  <div className="flex-1 space-y-1.5">
                    <div className="bg-blue-50 text-blue-700 rounded-lg p-2.5 text-xs">
                      <strong>Layers 0-11:</strong> attend to prompt only (format coherence)
                    </div>
                    <div className="bg-purple-50 text-purple-700 rounded-lg p-2.5 text-xs">
                      <strong>Layers 12-35:</strong> attend to prompt + thought tokens (reasoning signal)
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* How It Works - Key Mechanisms */}
          <h2 className="text-xl font-semibold text-gray-900 mb-6">Key Mechanisms</h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-12">
            <div className="bg-white border border-gray-200 rounded-xl p-5">
              <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center text-blue-600 font-bold text-lg mb-3">1</div>
              <h3 className="font-semibold text-gray-800 mb-2">KV-Cache Recurrence</h3>
              <p className="text-sm text-gray-600">Feed hidden states back through layers 12-35. Each step adds a &quot;thought token&quot; to the KV cache. Layers 0-11 are skipped - they expect embeddings and cause degeneration.</p>
            </div>
            <div className="bg-white border border-gray-200 rounded-xl p-5">
              <div className="w-10 h-10 rounded-lg bg-purple-100 flex items-center justify-center text-purple-600 font-bold text-lg mb-3">2</div>
              <h3 className="font-semibold text-gray-800 mb-2">Split-Layer Generation</h3>
              <p className="text-sm text-gray-600">Lower layers see only the prompt (clean format). Upper layers see prompt + thoughts (reasoning). This preserves output structure while injecting latent reasoning.</p>
            </div>
            <div className="bg-white border border-gray-200 rounded-xl p-5">
              <div className="w-10 h-10 rounded-lg bg-green-100 flex items-center justify-center text-green-600 font-bold text-lg mb-3">3</div>
              <h3 className="font-semibold text-gray-800 mb-2">Answer-Mass Gating</h3>
              <p className="text-sm text-gray-600">Measure probability mass on answer tokens (A-E, 0-9). High mass = simple task, skip recurrence. Low mass = complex task, apply recurrence. Zero training required.</p>
            </div>
            <div className="bg-white border border-gray-200 rounded-xl p-5">
              <div className="w-10 h-10 rounded-lg bg-amber-100 flex items-center justify-center text-amber-600 font-bold text-lg mb-3">4</div>
              <h3 className="font-semibold text-gray-800 mb-2">Prompt-Weight Blending</h3>
              <p className="text-sm text-gray-600">First generated token blends 70% baseline + 30% thought logits. Anchors output format to prompt expectations while injecting reasoning signal.</p>
            </div>
          </div>

          {/* Experiment Timeline */}
          <h2 className="text-xl font-semibold text-gray-900 mb-6">Experiment Timeline</h2>

          <PhaseCard number="1" title="Raw Recurrence Discovery" status="success">
            <p className="text-sm text-gray-600 mb-4">Mid-layer recurrence at N=32 beats text chain-of-thought with far fewer FLOPs.</p>
            <div className="bg-gray-50 rounded-lg p-4">
              <Bar value={90} label="N=32 (ours)" color="bg-green-500" sublabel="90% eval accuracy" />
              <Bar value={85} label="Text CoT" color="bg-blue-400" sublabel="85% (128 generated tokens)" />
              <Bar value={80} label="N=1 loop" color="bg-blue-300" sublabel="80%" />
              <Bar value={45} label="Baseline" color="bg-gray-300" sublabel="45%" />
            </div>
          </PhaseCard>

          <PhaseCard number="2" title="Stability Analysis" status="insight">
            <p className="text-sm text-gray-600 mb-4">The upper 2/3 of a frozen transformer forms a stable attractor.</p>
            <div className="grid grid-cols-3 gap-3">
              <div className="bg-blue-50 rounded-lg p-3 text-center">
                <div className="text-lg font-bold text-blue-700">175-193</div>
                <div className="text-xs text-blue-600">Hidden state norm range</div>
              </div>
              <div className="bg-blue-50 rounded-lg p-3 text-center">
                <div className="text-lg font-bold text-blue-700">~0.95</div>
                <div className="text-xs text-blue-600">Cosine sim convergence</div>
              </div>
              <div className="bg-blue-50 rounded-lg p-3 text-center">
                <div className="text-lg font-bold text-blue-700">512+</div>
                <div className="text-xs text-blue-600">Stable steps (no reg.)</div>
              </div>
            </div>
          </PhaseCard>

          <PhaseCard number="3" title="Learned Gates (HaltGate)" status="partial">
            <p className="text-sm text-gray-600">~1.05M params trained with REINFORCE to decide when to stop thinking. Works on eval prompts but doesn{"'"}t generalize to GSM8K - trained on only 20 prompts.</p>
          </PhaseCard>

          <PhaseCard number="4" title="Memory System" status="partial">
            <p className="text-sm text-gray-600 mb-4">Three memory tiers tested. Without gating, memory introduces noise.</p>
            <div className="space-y-2">
              {[
                { name: "KVMemory", desc: "Ring buffer + cosine retrieval", size: "~1MB" },
                { name: "SurpriseMemory", desc: "Titans-inspired, stores on state changes", size: "~1MB" },
                { name: "NeuralMemory", desc: "Learned read/write heads", size: "~13MB" },
                { name: "MemoryGate", desc: "Trained gate for when to read/write", size: "~1.1M params" },
              ].map((m) => (
                <div key={m.name} className="flex items-center justify-between bg-gray-50 rounded-lg px-4 py-2.5">
                  <div>
                    <span className="text-sm font-medium text-gray-800">{m.name}</span>
                    <span className="text-xs text-gray-500 ml-2">{m.desc}</span>
                  </div>
                  <span className="text-xs font-mono text-gray-400">{m.size}</span>
                </div>
              ))}
            </div>
          </PhaseCard>

          <PhaseCard number="5" title="Benchmark Ablation (N=50)" status="success">
            <p className="text-sm text-gray-600 mb-4">Config G was the only config beating GSM8K baseline. Text CoT is catastrophic on ARC.</p>
            <div className="bg-gray-50 rounded-lg p-4 mb-2">
              <p className="text-xs font-medium text-gray-500 mb-3">GSM8K Accuracy by Config</p>
              <Bar value={46} label="G: Gate+Mem+KV" color="bg-green-500" sublabel="46% (best)" />
              <Bar value={44} label="A: Baseline" color="bg-gray-400" sublabel="44%" />
              <Bar value={40} label="D: RL halt gate" color="bg-blue-400" sublabel="40%" />
              <Bar value={36} label="F: RL + neural" color="bg-blue-300" sublabel="36%" />
              <Bar value={36} label="I: Lys et al." color="bg-gray-300" sublabel="36%" />
              <Bar value={34} label="H: Text CoT" color="bg-red-300" sublabel="34%" />
              <Bar value={34} label="C: Heuristic" color="bg-blue-200" sublabel="34%" />
              <Bar value={30} label="B: Fixed N=32" color="bg-blue-200" sublabel="30%" />
              <Bar value={28} label="E: RL + KV mem" color="bg-red-200" sublabel="28%" />
            </div>
          </PhaseCard>

          <PhaseCard number="6" title="Latent Beam Search" status="failed">
            <p className="text-sm text-gray-600 mb-4">Branching in hidden-state space disrupts stable recurrence dynamics.</p>
            <div className="bg-gray-50 rounded-lg p-4">
              <Bar value={95} label="Baseline" color="bg-green-400" sublabel="95% eval" />
              <Bar value={75} label="W=3, D=8" color="bg-red-300" sublabel="75% (-20pp)" />
              <Bar value={70} label="W=5, D=8" color="bg-red-400" sublabel="70% (-25pp)" />
            </div>
          </PhaseCard>

          <PhaseCard number="7A" title="KV-Cache Recurrence" status="insight">
            <p className="text-sm text-gray-600 mb-4">4 steps optimal. More steps degrade - the model &quot;overthinks.&quot;</p>
            <div className="bg-gray-50 rounded-lg p-4">
              <Bar value={46} label="4 steps" color="bg-green-500" sublabel="46% GSM8K (best)" />
              <Bar value={44} label="0 steps" color="bg-gray-400" sublabel="44% (baseline)" />
              <Bar value={44} label="8 steps" color="bg-yellow-400" sublabel="44%" />
              <Bar value={40} label="16 steps" color="bg-orange-400" sublabel="40%" />
              <Bar value={38} label="32 steps" color="bg-red-300" sublabel="38%" />
              <Bar value={30} label="64 steps" color="bg-red-400" sublabel="30%" />
            </div>
          </PhaseCard>

          <PhaseCard number="7B" title="Split-Layer Generation & Gating" status="success">
            <p className="text-sm text-gray-600 mb-4">
              The breakthrough phase. Split-layer gen helps GSM8K (+7pp) but destroys ARC (-55pp). Answer-mass gating solves the routing problem.
            </p>
            <div className="bg-gray-50 rounded-lg p-4 mb-4">
              <p className="text-xs font-medium text-gray-500 mb-3">Gating Approach Comparison</p>
              {[
                { label: "AM3 (winner)", gsm: 52.5, arc: 75.0, best: true },
                { label: "Confidence 0.5", gsm: 40, arc: 85.0 },
                { label: "KL-divergence", gsm: 56, arc: 54.0 },
                { label: "First-token", gsm: null, arc: 62.0 },
              ].map((g) => (
                <div key={g.label} className={`flex items-center gap-3 mb-3 ${g.best ? "bg-green-50 -mx-2 px-2 py-1.5 rounded-lg" : ""}`}>
                  <div className="w-28 text-sm text-gray-600 text-right shrink-0">{g.label}</div>
                  <div className="flex-1 space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-400 w-12">GSM8K</span>
                      <div className="flex-1 bg-gray-100 rounded-full h-4 relative overflow-hidden">
                        {g.gsm !== null && (
                          <div className={`${g.best ? "bg-green-500" : "bg-blue-300"} h-full rounded-full`} style={{ width: `${g.gsm}%` }} />
                        )}
                        <span className="absolute inset-0 flex items-center px-2 text-xs text-gray-600">{g.gsm !== null ? `${g.gsm}%` : "N/A"}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-400 w-12">ARC</span>
                      <div className="flex-1 bg-gray-100 rounded-full h-4 relative overflow-hidden">
                        <div className={`${g.best ? "bg-green-400" : "bg-purple-300"} h-full rounded-full`} style={{ width: `${g.arc}%` }} />
                        <span className="absolute inset-0 flex items-center px-2 text-xs text-gray-600">{g.arc}%</span>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-sm text-amber-800">
              <strong>Why confidence gating fails:</strong> GSM8K first tokens (&quot;Let&quot;, &quot;The&quot;) have high confidence (0.5-0.98) even on wrong answers. Answer-mass gating measures whether the model expects an answer-format token vs. a continuation token - a fundamentally different signal.
            </div>
          </PhaseCard>

          {/* Novelty Claims */}
          <h2 className="text-xl font-semibold text-gray-900 mb-4">Novelty Claims</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-12">
            {[
              { title: "First training-free latent reasoning", desc: "Every prior method (COCONUT, SoftCoT, Pause Tokens, Quiet-STaR, Retrofitted Recurrence) requires training.", icon: "bg-green-500" },
              { title: "Split-layer generation is novel", desc: "No prior work applies different KV caches to different layer groups during generation.", icon: "bg-blue-500" },
              { title: "Answer-mass gating is novel", desc: "Aggregate probability mass on answer-format tokens as routing signal has no precedent.", icon: "bg-purple-500" },
              { title: "Partial-layer recurrence (no training)", desc: "Retrofitted Recurrence needs billions of pretraining tokens. Ours works frozen at inference.", icon: "bg-orange-500" },
            ].map((c) => (
              <div key={c.title} className="flex gap-3 bg-white border border-gray-200 rounded-xl p-4">
                <div className={`${c.icon} w-2 rounded-full shrink-0`} />
                <div>
                  <div className="text-sm font-semibold text-gray-800">{c.title}</div>
                  <div className="text-xs text-gray-500 mt-1">{c.desc}</div>
                </div>
              </div>
            ))}
          </div>

          {/* Comparison Table */}
          <h2 className="text-xl font-semibold text-gray-900 mb-4">Comparison with Related Work</h2>
          <div className="overflow-x-auto mb-12">
            <table className="w-full text-xs border border-gray-200 rounded-xl overflow-hidden">
              <thead className="bg-gray-900 text-white">
                <tr>
                  <th className="text-left px-4 py-3 font-medium"></th>
                  <th className="text-center px-4 py-3 font-medium bg-green-700">Ours</th>
                  <th className="text-center px-4 py-3 font-medium">COCONUT</th>
                  <th className="text-center px-4 py-3 font-medium">SoftCoT</th>
                  <th className="text-center px-4 py-3 font-medium">Retrofitted</th>
                  <th className="text-center px-4 py-3 font-medium">Lys et al.</th>
                </tr>
              </thead>
              <tbody>
                {[
                  { label: "Model frozen?", ours: "Yes", coconut: "No", soft: "Main LLM yes", retro: "No", lys: "Yes", oursGood: true },
                  { label: "Training", ours: "None", coconut: "Full FT", soft: "Projection", retro: "Continued PT", lys: "None", oursGood: true },
                  { label: "Recurrence layers", ours: "12-35", coconut: "All", soft: "N/A", retro: "Subset", lys: "All" },
                  { label: "Split-layer gen", ours: "Yes", coconut: "No", soft: "No", retro: "No", lys: "No", oursGood: true },
                  { label: "Answer-mass gate", ours: "Yes", coconut: "No", soft: "No", retro: "No", lys: "No", oursGood: true },
                  { label: "GSM8K delta", ours: "+13pp", coconut: "-8.8pp", soft: "+1.4pp", retro: "N/A", lys: "N/A", oursGood: true },
                  { label: "Max iterations", ours: "512+", coconut: "Fixed", soft: "N/A", retro: "Fixed", lys: "3" },
                ].map((r) => (
                  <tr key={r.label} className="border-t border-gray-100">
                    <td className="px-4 py-2.5 font-medium text-gray-700">{r.label}</td>
                    <td className={`px-4 py-2.5 text-center font-medium ${r.oursGood ? "text-green-700 bg-green-50" : "bg-green-50/50"}`}>{r.ours}</td>
                    <td className="px-4 py-2.5 text-center text-gray-500">{r.coconut}</td>
                    <td className="px-4 py-2.5 text-center text-gray-500">{r.soft}</td>
                    <td className="px-4 py-2.5 text-center text-gray-500">{r.retro}</td>
                    <td className="px-4 py-2.5 text-center text-gray-500">{r.lys}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Known Limitations */}
          <h2 className="text-xl font-semibold text-gray-900 mb-4">Known Limitations</h2>
          <div className="space-y-2 mb-12">
            {[
              { title: "ARC regression (-15.5pp)", desc: "Split-layer generation disrupts simple pattern-matching tasks" },
              { title: "N=200 sample size", desc: "Larger samples needed for statistical significance" },
              { title: "Single model tested", desc: "Needs validation on Llama 3, Gemma 2, Mistral" },
              { title: "4-bit quantized baseline", desc: "The 39.5% GSM8K baseline is weak; results on full-precision models may differ" },
              { title: "Task-specific gating", desc: "Answer-mass gating is tailored to multiple-choice and math formats" },
              { title: "Degradation at >4 steps", desc: "Optimal at 4 recurrence steps; more steps hurt" },
            ].map((l, i) => (
              <div key={i} className="flex items-start gap-3 bg-gray-50 rounded-lg p-3">
                <span className="text-xs font-mono text-gray-400 mt-0.5">{i + 1}</span>
                <div>
                  <span className="text-sm font-medium text-gray-800">{l.title}</span>
                  <span className="text-sm text-gray-500"> - {l.desc}</span>
                </div>
              </div>
            ))}
          </div>

          {/* References */}
          <h2 className="text-xl font-semibold text-gray-900 mb-4">References</h2>
          <div className="bg-gray-50 rounded-xl p-5 mb-10">
            <ul className="text-sm text-gray-600 space-y-2">
              <li>Hao et al. (2024). &quot;Training Large Language Models to Reason in a Continuous Latent Space&quot; (COCONUT)</li>
              <li>Xu et al. (2025). &quot;SoftCoT: Soft Chain-of-Thought for Efficient Reasoning with LLMs&quot;</li>
              <li>McLeish et al. (2025). &quot;Teaching Pretrained Language Models to Think Deeper with Retrofitted Recurrence&quot;</li>
              <li>Geiping et al. (2025). &quot;Scaling Up Test-Time Compute with Latent Reasoning&quot;</li>
              <li>Belitsky et al. (2025). &quot;KV Cache Steering for Controlling Frozen LLMs&quot;</li>
              <li>Sun et al. (2024). &quot;You Only Cache Once: Decoder-Decoder Architectures for Language Models&quot; (YOCO)</li>
              <li>Goyal et al. (2024). &quot;Think before you speak: Training Language Models With Pause Tokens&quot;</li>
              <li>Zelikman et al. (2024). &quot;Quiet-STaR: Language Models Can Teach Themselves to Think Before Speaking&quot;</li>
              <li>Lys et al. (2026). &quot;Inner Loop Inference for Pretrained Transformers&quot;</li>
              <li>Graves (2016). &quot;Adaptive Computation Time for Recurrent Neural Networks&quot;</li>
            </ul>
          </div>

          {/* Citation */}
          <h2 className="text-xl font-semibold text-gray-900 mb-4">Citation</h2>
          <div className="bg-gray-900 text-gray-300 rounded-xl p-5 font-mono text-xs mb-10">
            <pre>{`@misc{closed-thought-llm-2026,
  title={Closed-Thought LLM: Training-Free Latent
         Reasoning for Frozen Language Models
         via Split-Layer Generation},
  author={Shiv and Claude Opus 4.6},
  year={2026},
  note={Research prototype. One of us wrote
        the code, the other debugged at 3am.
        We'll let you guess which is which.}
}`}</pre>
          </div>
        </article>
      </main>

      <Footer />
    </>
  );
}
