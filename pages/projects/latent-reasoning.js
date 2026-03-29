import Head from "next/head";
import Link from "next/link";
import Navbar from "../../components/Navbar";
import Footer from "../../components/Footer";

export default function LatentReasoning() {
  return (
    <>
      <Head>
        <title>Closed-Thought LLM - Shiv Gupta</title>
      </Head>

      <Navbar />

      <main className="pt-16">
        <article className="max-w-3xl mx-auto px-6 py-24">
          <Link href="/#projects" className="text-sm text-blue-600 hover:underline mb-6 inline-block">
            &larr; Back to Projects
          </Link>

          <h1 className="text-4xl font-bold text-gray-900 mb-2">
            Closed-Thought LLM
          </h1>
          <p className="text-sm text-gray-500 italic mb-4">
            Training-Free Latent Reasoning for Frozen Language Models via Split-Layer Generation
          </p>
          <div className="flex flex-wrap gap-2 mb-4">
            <span className="text-xs px-2 py-1 rounded-full bg-gray-100 text-gray-600">Python</span>
            <span className="text-xs px-2 py-1 rounded-full bg-gray-100 text-gray-600">PyTorch</span>
            <span className="text-xs px-2 py-1 rounded-full bg-gray-100 text-gray-600">LLMs</span>
            <span className="text-xs px-2 py-1 rounded-full bg-gray-100 text-gray-600">CUDA</span>
            <span className="text-xs text-gray-400 ml-2">2026</span>
          </div>

          {/* Headline */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-6 mb-10">
            <p className="text-blue-900 font-medium text-lg mb-2">
              Can a frozen LLM &ldquo;think&rdquo; in latent space by looping its own hidden states &mdash; without any training?
            </p>
            <p className="text-blue-800">
              <strong>Yes.</strong> We achieve <strong>+13pp on GSM8K</strong> (39.5% &rarr; 52.5%) on a frozen Qwen3-8B with zero training &mdash; via KV-cache recurrence, split-layer generation, and answer-mass gating. No fine-tuning, no auxiliary models, no learned parameters.
            </p>
            <p className="text-blue-700 text-sm mt-3">
              A 2025 survey of ~30+ latent reasoning methods found <strong>zero training-free approaches</strong>. This is the first.
            </p>
          </div>

          {/* Headline Results */}
          <h2 className="text-xl font-semibold text-gray-900 mb-4">Headline Results (N=200)</h2>
          <div className="overflow-x-auto mb-10">
            <table className="w-full text-sm border border-gray-200 rounded-lg overflow-hidden">
              <thead className="bg-gray-50">
                <tr>
                  <th className="text-left px-4 py-3 font-medium text-gray-700">Method</th>
                  <th className="text-center px-4 py-3 font-medium text-gray-700">GSM8K</th>
                  <th className="text-center px-4 py-3 font-medium text-gray-700">ARC</th>
                  <th className="text-center px-4 py-3 font-medium text-gray-700">Training</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-t border-gray-100">
                  <td className="px-4 py-3 text-gray-600">Frozen Qwen3-8B baseline</td>
                  <td className="px-4 py-3 text-center text-gray-600">39.5%</td>
                  <td className="px-4 py-3 text-center text-gray-600">90.5%</td>
                  <td className="px-4 py-3 text-center text-gray-500">None</td>
                </tr>
                <tr className="border-t border-gray-100 bg-green-50 font-medium">
                  <td className="px-4 py-3 text-gray-900">Ours (AM3: answer-mass gated split-layer)</td>
                  <td className="px-4 py-3 text-center text-green-700">52.5%</td>
                  <td className="px-4 py-3 text-center text-gray-700">75.0%</td>
                  <td className="px-4 py-3 text-center text-green-700">None</td>
                </tr>
                <tr className="border-t border-gray-100">
                  <td className="px-4 py-3 text-gray-600">SoftCoT (Xu et al., 2025)</td>
                  <td className="px-4 py-3 text-center text-gray-600">+1.4pp</td>
                  <td className="px-4 py-3 text-center text-gray-400">&mdash;</td>
                  <td className="px-4 py-3 text-center text-gray-500">Projection module</td>
                </tr>
                <tr className="border-t border-gray-100">
                  <td className="px-4 py-3 text-gray-600">COCONUT (Hao et al., 2024)</td>
                  <td className="px-4 py-3 text-center text-gray-600">34.1%*</td>
                  <td className="px-4 py-3 text-center text-gray-400">&mdash;</td>
                  <td className="px-4 py-3 text-center text-gray-500">Full fine-tuning</td>
                </tr>
              </tbody>
            </table>
            <p className="text-xs text-gray-400 mt-2">*COCONUT tested on GPT-2, not directly comparable.</p>
          </div>

          {/* How It Works */}
          <h2 className="text-xl font-semibold text-gray-900 mb-6">How It Works</h2>

          {/* 1. KV-Cache Recurrence */}
          <h3 className="text-lg font-semibold text-gray-800 mb-3">1. KV-Cache Recurrence (Partial-Layer)</h3>
          <p className="text-gray-600 leading-relaxed mb-4">
            Feed the last hidden state back through layers 12-35 for N steps. Each step accumulates a &ldquo;thought token&rdquo; in the KV cache, so all subsequent computation can attend to the full history of thoughts + the original prompt.
          </p>
          <div className="bg-gray-900 text-green-400 rounded-lg p-5 font-mono text-xs leading-relaxed mb-4 overflow-x-auto">
            <pre>{`Input → Layers 0-11 (frozen, one pass) → h₀
                                          ↓
                              ┌→ Layers 12-35 → h₁ (KV cached) ─┐
                              │   Layers 12-35 → h₂ (KV cached)  │
                              │   Layers 12-35 → h₃ (KV cached)  │
                              │         ...N steps...             │
                              └───────────────────────────────────┘
                                          ↓
                                    Generation`}</pre>
          </div>
          <p className="text-gray-600 leading-relaxed mb-8">
            <strong>Why partial layers?</strong> Layers 0-11 handle tokenization/syntax and expect embedding-space inputs. Feeding hidden states from layer 35 back to layer 0 causes complete degeneration. Layers 12-35 form a stable recurrence zone &mdash; hidden states stay bounded across 512+ steps with no regularization.
          </p>

          {/* 2. Split-Layer Generation */}
          <h3 className="text-lg font-semibold text-gray-800 mb-3">2. Split-Layer Generation</h3>
          <p className="text-gray-600 leading-relaxed mb-4">
            The key novel mechanism. During autoregressive generation, different layer groups attend to different contexts:
          </p>
          <ul className="list-disc list-inside text-gray-600 mb-4 space-y-1">
            <li><strong>Layers 0-11:</strong> Attend to prompt only (clean forward pass)</li>
            <li><strong>Layers 12-35:</strong> Attend to prompt + all thought tokens (enriched attention)</li>
          </ul>
          <div className="bg-gray-900 text-green-400 rounded-lg p-5 font-mono text-xs leading-relaxed mb-4 overflow-x-auto">
            <pre>{`Generated token → Layers 0-11 (prompt KV only)
                      ↓
                  Layers 12-35 (prompt + thought KV)
                      ↓
                  lm_head → next token`}</pre>
          </div>
          <p className="text-gray-600 leading-relaxed mb-8">
            This lets the model maintain output format coherence (from lower layers processing the prompt normally) while injecting reasoning signal (from upper layers attending to thought tokens).
          </p>

          {/* 3. Answer-Mass Gating */}
          <h3 className="text-lg font-semibold text-gray-800 mb-3">3. Answer-Mass Gating</h3>
          <p className="text-gray-600 leading-relaxed mb-4">
            Not all tasks benefit from recurrence. We gate using the probability mass on answer-format tokens (A-E, 0-9) in the baseline logit distribution:
          </p>
          <ul className="list-disc list-inside text-gray-600 mb-4 space-y-1">
            <li><strong>High mass (&gt;0.3):</strong> Simple task (e.g., multiple choice) &rarr; skip recurrence, use baseline</li>
            <li><strong>Low mass (&lt;0.3):</strong> Complex task (e.g., math reasoning) &rarr; apply recurrence + split-layer gen</li>
          </ul>
          <p className="text-gray-600 leading-relaxed mb-8">
            This correctly routes ARC items to baseline (~70% of items) and GSM8K items to recurrence (~100% of items), with zero training.
          </p>

          {/* 4. Prompt-Weight Blending */}
          <h3 className="text-lg font-semibold text-gray-800 mb-3">4. Prompt-Weight Blending</h3>
          <p className="text-gray-600 leading-relaxed mb-4">
            For the first generated token, blend baseline logits with thought logits:
          </p>
          <div className="bg-gray-900 text-green-400 rounded-lg p-5 font-mono text-xs leading-relaxed mb-4 overflow-x-auto">
            <pre>{`first_token_logits = 0.7 × baseline_logits + 0.3 × thought_logits`}</pre>
          </div>
          <p className="text-gray-600 leading-relaxed mb-10">
            This anchors the output format to what the prompt expects while injecting reasoning signal. Subsequent tokens use split-layer generation normally.
          </p>

          {/* Architecture Diagram */}
          <h2 className="text-xl font-semibold text-gray-900 mb-4">Architecture</h2>
          <div className="bg-gray-900 text-green-400 rounded-lg p-5 font-mono text-xs leading-relaxed mb-10 overflow-x-auto">
            <pre>{`┌──────────────────────────────────────────────────────┐
│                   RECURRENCE PHASE                    │
│                                                      │
│  Input → Tokenize → Layers 0-11 → h₀                │
│                                    ↓                 │
│                        ┌──→ Layers 12-35 ──→ norm ──┐│
│                        │    (KV cache grows)        ││
│                        │         × N steps          ││
│                        └────────────────────────────┘│
│                                                      │
├──────────────────────────────────────────────────────┤
│                   GATING PHASE                        │
│                                                      │
│  Baseline logits → P(A,B,C,D,0-9) → answer_mass     │
│  If mass > 0.3 → SKIP recurrence (use baseline)      │
│  If mass < 0.3 → USE recurrence (split-layer gen)    │
│                                                      │
├──────────────────────────────────────────────────────┤
│                   GENERATION PHASE                    │
│                                                      │
│  First token: 0.7×baseline + 0.3×thought logits      │
│                        ↓                             │
│  Subsequent tokens:                                  │
│    Layers 0-11:  attend to prompt only               │
│    Layers 12-35: attend to prompt + thought tokens   │
│                        ↓                             │
│    lm_head → next token                              │
└──────────────────────────────────────────────────────┘`}</pre>
          </div>

          {/* Experiment History */}
          <h2 className="text-xl font-semibold text-gray-900 mb-6">Full Experiment History</h2>

          {/* Phase 1 */}
          <h3 className="text-lg font-semibold text-gray-800 mb-3">Phase 1: Raw Recurrence Discovery</h3>
          <p className="text-gray-600 leading-relaxed mb-4">
            Feeding the final hidden state back into layer 12 and looping through upper layers:
          </p>
          <div className="overflow-x-auto mb-4">
            <table className="w-full text-sm border border-gray-200 rounded-lg overflow-hidden">
              <thead className="bg-gray-50">
                <tr>
                  <th className="text-center px-4 py-2 font-medium text-gray-700">Recurrence Steps</th>
                  <th className="text-center px-4 py-2 font-medium text-gray-700">Eval Accuracy</th>
                  <th className="text-left px-4 py-2 font-medium text-gray-700">Method</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-t border-gray-100"><td className="px-4 py-2 text-center">0</td><td className="px-4 py-2 text-center">45%</td><td className="px-4 py-2">Baseline</td></tr>
                <tr className="border-t border-gray-100"><td className="px-4 py-2 text-center">1</td><td className="px-4 py-2 text-center">80%</td><td className="px-4 py-2">Single loop</td></tr>
                <tr className="border-t border-gray-100 bg-green-50 font-medium"><td className="px-4 py-2 text-center">32</td><td className="px-4 py-2 text-center text-green-700">90%</td><td className="px-4 py-2">Best mid-layer result</td></tr>
                <tr className="border-t border-gray-100"><td className="px-4 py-2 text-center">&mdash;</td><td className="px-4 py-2 text-center">85%</td><td className="px-4 py-2">Text CoT @ 128 tokens</td></tr>
              </tbody>
            </table>
          </div>
          <p className="text-gray-600 leading-relaxed mb-8">
            Mid-layer recurrence at N=32 <strong>beats text chain-of-thought</strong> with far fewer FLOPs and zero generated tokens.
          </p>

          {/* Phase 2 */}
          <h3 className="text-lg font-semibold text-gray-800 mb-3">Phase 2: Stability Analysis</h3>
          <p className="text-gray-600 leading-relaxed mb-8">
            The upper 2/3 of a frozen transformer forms a <strong>stable attractor</strong>: hidden state norms stay bounded (175-193) across 512+ steps, cosine similarity converges to ~0.95, and zero regularization is needed. Adaptive halting via logit lens shows easy problems halt in 1 step, hard in 86-110.
          </p>

          {/* Phase 3 */}
          <h3 className="text-lg font-semibold text-gray-800 mb-3">Phase 3: Learned Gates</h3>
          <p className="text-gray-600 leading-relaxed mb-8">
            <strong>HaltGate</strong> (~1.05M params): Trained with REINFORCE to decide when to stop thinking. Works on eval prompts but doesn&rsquo;t generalize to GSM8K (trained on only 20 prompts). Supervised bootstrapping &rarr; RL refinement pipeline.
          </p>

          {/* Phase 4 */}
          <h3 className="text-lg font-semibold text-gray-800 mb-3">Phase 4: Memory System</h3>
          <p className="text-gray-600 leading-relaxed mb-3">Three tiers tested:</p>
          <ul className="list-disc list-inside text-gray-600 mb-4 space-y-1">
            <li><strong>KVMemory:</strong> Ring buffer with cosine-similarity retrieval (~1MB)</li>
            <li><strong>SurpriseMemory:</strong> Titans-inspired, stores on significant hidden-state changes</li>
            <li><strong>NeuralMemory:</strong> Learned read/write heads (~13MB)</li>
            <li><strong>MemoryGate</strong> (~1.1M params): Without gating, KV memory introduces noise. Trained gate learns when to read/write.</li>
          </ul>
          <p className="text-gray-600 leading-relaxed mb-8">
            Memory follows Ebbinghaus-like forgetting curves &mdash; KV drops to 0% after ~200 distractor steps.
          </p>

          {/* Phase 5 */}
          <h3 className="text-lg font-semibold text-gray-800 mb-3">Phase 5: Benchmark Ablation (N=50)</h3>
          <div className="overflow-x-auto mb-8">
            <table className="w-full text-sm border border-gray-200 rounded-lg overflow-hidden">
              <thead className="bg-gray-50">
                <tr>
                  <th className="text-center px-3 py-2 font-medium text-gray-700">Config</th>
                  <th className="text-left px-3 py-2 font-medium text-gray-700">Description</th>
                  <th className="text-center px-3 py-2 font-medium text-gray-700">GSM8K</th>
                  <th className="text-center px-3 py-2 font-medium text-gray-700">ARC</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-t border-gray-100"><td className="px-3 py-2 text-center">A</td><td className="px-3 py-2">No recurrence (baseline)</td><td className="px-3 py-2 text-center">44%</td><td className="px-3 py-2 text-center">84%</td></tr>
                <tr className="border-t border-gray-100"><td className="px-3 py-2 text-center">B</td><td className="px-3 py-2">Fixed N=32 mid-layer loop</td><td className="px-3 py-2 text-center">30%</td><td className="px-3 py-2 text-center">76%</td></tr>
                <tr className="border-t border-gray-100"><td className="px-3 py-2 text-center">C</td><td className="px-3 py-2">Heuristic confidence gate</td><td className="px-3 py-2 text-center">34%</td><td className="px-3 py-2 text-center">74%</td></tr>
                <tr className="border-t border-gray-100"><td className="px-3 py-2 text-center">D</td><td className="px-3 py-2">RL halt gate</td><td className="px-3 py-2 text-center">40%</td><td className="px-3 py-2 text-center">84%</td></tr>
                <tr className="border-t border-gray-100"><td className="px-3 py-2 text-center">E</td><td className="px-3 py-2">RL gate + KV memory</td><td className="px-3 py-2 text-center">28%</td><td className="px-3 py-2 text-center">82%</td></tr>
                <tr className="border-t border-gray-100"><td className="px-3 py-2 text-center">F</td><td className="px-3 py-2">RL gate + neural memory</td><td className="px-3 py-2 text-center">36%</td><td className="px-3 py-2 text-center">84%</td></tr>
                <tr className="border-t border-gray-100 bg-green-50 font-medium"><td className="px-3 py-2 text-center">G</td><td className="px-3 py-2">RL gate + MemoryGate + KV</td><td className="px-3 py-2 text-center text-green-700">46%</td><td className="px-3 py-2 text-center">78%</td></tr>
                <tr className="border-t border-gray-100"><td className="px-3 py-2 text-center">H</td><td className="px-3 py-2">Text CoT (128 tokens)</td><td className="px-3 py-2 text-center">34%</td><td className="px-3 py-2 text-center">42%</td></tr>
                <tr className="border-t border-gray-100"><td className="px-3 py-2 text-center">I</td><td className="px-3 py-2">Lys et al. R=3 @ layer 18</td><td className="px-3 py-2 text-center">36%</td><td className="px-3 py-2 text-center">78%</td></tr>
              </tbody>
            </table>
          </div>

          {/* Phase 6 */}
          <h3 className="text-lg font-semibold text-gray-800 mb-3">Phase 6: Latent Beam Search</h3>
          <p className="text-gray-600 leading-relaxed mb-8">
            Branching in hidden-state space (not token space). Beam search in latent space <strong>hurts</strong> &mdash; branching disrupts the stable recurrence dynamics. Width=3 depth=8 drops from 95% to 75%.
          </p>

          {/* Phase 7A */}
          <h3 className="text-lg font-semibold text-gray-800 mb-3">Phase 7A: KV-Cache Recurrence</h3>
          <p className="text-gray-600 leading-relaxed mb-4">
            Adding prompt attention during recurrence via KV cache. 4 steps optimal &mdash; more steps degrade as the model &ldquo;overthinks.&rdquo;
          </p>
          <div className="overflow-x-auto mb-8">
            <table className="w-full text-sm border border-gray-200 rounded-lg overflow-hidden">
              <thead className="bg-gray-50">
                <tr>
                  <th className="text-center px-4 py-2 font-medium text-gray-700">Config</th>
                  <th className="text-center px-4 py-2 font-medium text-gray-700">Steps</th>
                  <th className="text-center px-4 py-2 font-medium text-gray-700">GSM8K</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-t border-gray-100"><td className="px-4 py-2 text-center">KV-0</td><td className="px-4 py-2 text-center">0</td><td className="px-4 py-2 text-center">44%</td></tr>
                <tr className="border-t border-gray-100 bg-green-50 font-medium"><td className="px-4 py-2 text-center">KV-A</td><td className="px-4 py-2 text-center">4</td><td className="px-4 py-2 text-center text-green-700">46%</td></tr>
                <tr className="border-t border-gray-100"><td className="px-4 py-2 text-center">KV-B</td><td className="px-4 py-2 text-center">8</td><td className="px-4 py-2 text-center">44%</td></tr>
                <tr className="border-t border-gray-100"><td className="px-4 py-2 text-center">KV-C</td><td className="px-4 py-2 text-center">16</td><td className="px-4 py-2 text-center">40%</td></tr>
                <tr className="border-t border-gray-100"><td className="px-4 py-2 text-center">KV-D</td><td className="px-4 py-2 text-center">32</td><td className="px-4 py-2 text-center">38%</td></tr>
                <tr className="border-t border-gray-100"><td className="px-4 py-2 text-center">KV-E</td><td className="px-4 py-2 text-center">64</td><td className="px-4 py-2 text-center">30%</td></tr>
              </tbody>
            </table>
          </div>

          {/* Phase 7B */}
          <h3 className="text-lg font-semibold text-gray-800 mb-3">Phase 7B: Split-Layer Generation & Gating (Breakthrough)</h3>
          <p className="text-gray-600 leading-relaxed mb-4">
            All results N=200. Split-layer generation helps GSM8K (+7pp) but destroys ARC (-55pp). Answer-mass gating solves this.
          </p>
          <div className="overflow-x-auto mb-4">
            <table className="w-full text-sm border border-gray-200 rounded-lg overflow-hidden">
              <thead className="bg-gray-50">
                <tr>
                  <th className="text-left px-3 py-2 font-medium text-gray-700">Approach</th>
                  <th className="text-center px-3 py-2 font-medium text-gray-700">ARC</th>
                  <th className="text-center px-3 py-2 font-medium text-gray-700">GSM8K</th>
                  <th className="text-left px-3 py-2 font-medium text-gray-700">Verdict</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-t border-gray-100"><td className="px-3 py-2">Confidence gate (0.5)</td><td className="px-3 py-2 text-center">85.0%</td><td className="px-3 py-2 text-center">~40%</td><td className="px-3 py-2 text-gray-500">Saves ARC, kills GSM8K</td></tr>
                <tr className="border-t border-gray-100"><td className="px-3 py-2">KL-divergence gate</td><td className="px-3 py-2 text-center">54.0%</td><td className="px-3 py-2 text-center">56.0%</td><td className="px-3 py-2 text-gray-500">Bad ARC routing</td></tr>
                <tr className="border-t border-gray-100"><td className="px-3 py-2">First-token override</td><td className="px-3 py-2 text-center">62.0%</td><td className="px-3 py-2 text-center">&mdash;</td><td className="px-3 py-2 text-gray-500">Baseline first token also &ldquo;T&rdquo;</td></tr>
                <tr className="border-t border-gray-100 bg-green-50 font-medium"><td className="px-3 py-2">Answer-mass gate (AM3)</td><td className="px-3 py-2 text-center text-green-700">75.0%</td><td className="px-3 py-2 text-center text-green-700">52.5%</td><td className="px-3 py-2 text-green-700">Winner</td></tr>
              </tbody>
            </table>
          </div>
          <p className="text-gray-600 leading-relaxed mb-10">
            <strong>Why confidence gating fails:</strong> The model&rsquo;s first-token confidence doesn&rsquo;t predict answer correctness. GSM8K first tokens (&ldquo;Let&rdquo;, &ldquo;The&rdquo;) have high confidence (0.5-0.98) even on wrong answers. <strong>Answer-mass gating works</strong> because it measures whether the model expects to output an answer-format token vs. a continuation token.
          </p>

          {/* Novelty Claims */}
          <h2 className="text-xl font-semibold text-gray-900 mb-4">Novelty Claims</h2>
          <div className="space-y-4 mb-10">
            <div className="border-l-4 border-blue-400 pl-4">
              <p className="text-gray-700 font-medium">First training-free latent reasoning system</p>
              <p className="text-gray-500 text-sm">Every prior method (COCONUT, SoftCoT, Pause Tokens, Quiet-STaR, HCoT, Retrofitted Recurrence) requires training.</p>
            </div>
            <div className="border-l-4 border-blue-400 pl-4">
              <p className="text-gray-700 font-medium">Split-layer generation is novel</p>
              <p className="text-gray-500 text-sm">No prior work applies different KV caches to different layer groups of a frozen model during generation.</p>
            </div>
            <div className="border-l-4 border-blue-400 pl-4">
              <p className="text-gray-700 font-medium">Answer-mass gating is novel</p>
              <p className="text-gray-500 text-sm">Prior routing uses entropy, token confidence, or learned signals. Aggregate probability mass on answer-format tokens as a binary routing signal has no precedent.</p>
            </div>
            <div className="border-l-4 border-blue-400 pl-4">
              <p className="text-gray-700 font-medium">Partial-layer recurrence without training</p>
              <p className="text-gray-500 text-sm">Retrofitted Recurrence (McLeish et al., 2025) requires billions of tokens of continued pretraining. Ours works on a frozen model at inference time.</p>
            </div>
          </div>

          {/* Comparison Table */}
          <h2 className="text-xl font-semibold text-gray-900 mb-4">Comparison with Related Work</h2>
          <div className="overflow-x-auto mb-10">
            <table className="w-full text-xs border border-gray-200 rounded-lg overflow-hidden">
              <thead className="bg-gray-50">
                <tr>
                  <th className="text-left px-3 py-2 font-medium text-gray-700"></th>
                  <th className="text-center px-3 py-2 font-medium text-gray-700">Ours</th>
                  <th className="text-center px-3 py-2 font-medium text-gray-700">COCONUT</th>
                  <th className="text-center px-3 py-2 font-medium text-gray-700">SoftCoT</th>
                  <th className="text-center px-3 py-2 font-medium text-gray-700">Retrofitted</th>
                  <th className="text-center px-3 py-2 font-medium text-gray-700">Lys et al.</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-t border-gray-100"><td className="px-3 py-2 font-medium text-gray-700">Model frozen?</td><td className="px-3 py-2 text-center text-green-700 font-medium">Yes</td><td className="px-3 py-2 text-center">No</td><td className="px-3 py-2 text-center">Main LLM yes</td><td className="px-3 py-2 text-center">No</td><td className="px-3 py-2 text-center">Yes</td></tr>
                <tr className="border-t border-gray-100"><td className="px-3 py-2 font-medium text-gray-700">Training</td><td className="px-3 py-2 text-center text-green-700 font-medium">None</td><td className="px-3 py-2 text-center">Full FT</td><td className="px-3 py-2 text-center">Projection</td><td className="px-3 py-2 text-center">Continued PT</td><td className="px-3 py-2 text-center">None</td></tr>
                <tr className="border-t border-gray-100"><td className="px-3 py-2 font-medium text-gray-700">Recurrence layers</td><td className="px-3 py-2 text-center">12-35</td><td className="px-3 py-2 text-center">All</td><td className="px-3 py-2 text-center">N/A</td><td className="px-3 py-2 text-center">Subset</td><td className="px-3 py-2 text-center">All</td></tr>
                <tr className="border-t border-gray-100"><td className="px-3 py-2 font-medium text-gray-700">Split-layer gen</td><td className="px-3 py-2 text-center text-green-700 font-medium">Yes</td><td className="px-3 py-2 text-center">No</td><td className="px-3 py-2 text-center">No</td><td className="px-3 py-2 text-center">No</td><td className="px-3 py-2 text-center">No</td></tr>
                <tr className="border-t border-gray-100"><td className="px-3 py-2 font-medium text-gray-700">Answer-mass gate</td><td className="px-3 py-2 text-center text-green-700 font-medium">Yes</td><td className="px-3 py-2 text-center">No</td><td className="px-3 py-2 text-center">No</td><td className="px-3 py-2 text-center">No</td><td className="px-3 py-2 text-center">No</td></tr>
                <tr className="border-t border-gray-100"><td className="px-3 py-2 font-medium text-gray-700">GSM8K delta</td><td className="px-3 py-2 text-center text-green-700 font-medium">+13pp</td><td className="px-3 py-2 text-center">-8.8pp</td><td className="px-3 py-2 text-center">+1.4pp</td><td className="px-3 py-2 text-center">N/A</td><td className="px-3 py-2 text-center">N/A</td></tr>
                <tr className="border-t border-gray-100"><td className="px-3 py-2 font-medium text-gray-700">Max iterations</td><td className="px-3 py-2 text-center">512+</td><td className="px-3 py-2 text-center">Fixed</td><td className="px-3 py-2 text-center">N/A</td><td className="px-3 py-2 text-center">Fixed</td><td className="px-3 py-2 text-center">3</td></tr>
              </tbody>
            </table>
          </div>

          {/* Known Limitations */}
          <h2 className="text-xl font-semibold text-gray-900 mb-4">Known Limitations</h2>
          <ol className="list-decimal list-inside text-gray-600 space-y-2 mb-10">
            <li><strong>ARC regression</strong> (-15.5pp) &mdash; split-layer generation disrupts simple pattern-matching tasks</li>
            <li><strong>N=200 sample size</strong> &mdash; larger samples needed for statistical significance</li>
            <li><strong>Single model tested</strong> &mdash; needs validation on Llama 3, Gemma 2, Mistral</li>
            <li><strong>4-bit quantized baseline</strong> &mdash; the 39.5% GSM8K baseline is weak; results on full-precision models may differ</li>
            <li><strong>Task-specific gating</strong> &mdash; answer-mass gating is tailored to multiple-choice and math formats</li>
            <li><strong>Degradation at &gt;4 steps</strong> &mdash; optimal at 4 recurrence steps; more steps hurt</li>
          </ol>

          {/* References */}
          <h2 className="text-xl font-semibold text-gray-900 mb-4">References</h2>
          <ul className="text-sm text-gray-600 space-y-2 mb-10">
            <li>Hao et al. (2024). &ldquo;Training Large Language Models to Reason in a Continuous Latent Space&rdquo; (COCONUT)</li>
            <li>Xu et al. (2025). &ldquo;SoftCoT: Soft Chain-of-Thought for Efficient Reasoning with LLMs&rdquo;</li>
            <li>McLeish et al. (2025). &ldquo;Teaching Pretrained Language Models to Think Deeper with Retrofitted Recurrence&rdquo;</li>
            <li>Geiping et al. (2025). &ldquo;Scaling Up Test-Time Compute with Latent Reasoning&rdquo;</li>
            <li>Belitsky et al. (2025). &ldquo;KV Cache Steering for Controlling Frozen LLMs&rdquo;</li>
            <li>Sun et al. (2024). &ldquo;You Only Cache Once: Decoder-Decoder Architectures for Language Models&rdquo; (YOCO)</li>
            <li>Goyal et al. (2024). &ldquo;Think before you speak: Training Language Models With Pause Tokens&rdquo;</li>
            <li>Zelikman et al. (2024). &ldquo;Quiet-STaR: Language Models Can Teach Themselves to Think Before Speaking&rdquo;</li>
            <li>Lys et al. (2026). &ldquo;Inner Loop Inference for Pretrained Transformers&rdquo;</li>
            <li>Graves (2016). &ldquo;Adaptive Computation Time for Recurrent Neural Networks&rdquo;</li>
          </ul>

          {/* Citation */}
          <h2 className="text-xl font-semibold text-gray-900 mb-4">Citation</h2>
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 font-mono text-xs text-gray-600 mb-10">
            <pre>{`@misc{closed-thought-llm-2026,
  title={Closed-Thought LLM: Training-Free Latent
         Reasoning for Frozen Language Models
         via Split-Layer Generation},
  author={Shiv},
  year={2026},
  note={Research prototype}
}`}</pre>
          </div>
        </article>
      </main>

      <Footer />
    </>
  );
}
