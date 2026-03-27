import Head from "next/head";
import Link from "next/link";
import Navbar from "../../components/Navbar";
import Footer from "../../components/Footer";

export default function YouTubeAlgorithm() {
  return (
    <>
      <Head>
        <title>Reverse Engineering the YouTube Algorithm - Shiv Gupta</title>
      </Head>

      <Navbar />

      <main className="pt-16">
        <article className="max-w-3xl mx-auto px-6 py-24">
          <Link href="/#projects" className="text-sm text-blue-600 hover:underline mb-6 inline-block">
            &larr; Back to Projects
          </Link>

          <h1 className="text-4xl font-bold text-gray-900 mb-2">
            Reverse Engineering the YouTube Algorithm
          </h1>
          <p className="text-sm text-gray-500 italic mb-4">
            Published as: Parametric Algorithmic Transformer Based Weighted YouTube Video Analysis
          </p>
          <div className="flex flex-wrap gap-2 mb-4">
            <span className="text-xs px-2 py-1 rounded-full bg-gray-100 text-gray-600">Python</span>
            <span className="text-xs px-2 py-1 rounded-full bg-gray-100 text-gray-600">Graph Analysis</span>
            <span className="text-xs px-2 py-1 rounded-full bg-gray-100 text-gray-600">Transformers</span>
            <span className="text-xs px-2 py-1 rounded-full bg-gray-100 text-gray-600">Research</span>
            <span className="text-xs text-gray-400 ml-2">2023</span>
          </div>

          <div className="flex gap-4 mb-10">
            <a
              href="https://www.researchgate.net/publication/385962242_Parametric_algorithmic_transformer_based_weighted_YouTube_video_analysis"
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-blue-600 hover:underline font-medium"
            >
              View on ResearchGate &rarr;
            </a>
            <a
              href="https://drive.google.com/file/d/1SeZ7qM6QHVxB5Ont9-CsWYe0b_WXiWwh/view?usp=sharing"
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-blue-600 hover:underline font-medium"
            >
              Download Paper &rarr;
            </a>
          </div>

          <div className="prose prose-gray max-w-none mb-12">
            <p className="text-gray-600 leading-relaxed mb-6">
              Built a graph crawler to map YouTube&rsquo;s recommendation algorithm to configurable depth, constructing node-edge graphs across 10K+ videos and applying ForceAtlas2 for community detection. Designed a custom weighted scoring algorithm with modularity-based classification, achieving cluster-level ranking via in-degree sampling.
            </p>
            <p className="text-gray-600 leading-relaxed">
              The work was published as a research paper presenting the parametric algorithmic transformer-based framework for weighted video analysis, modeling the relationships between recommended content at scale.
            </p>
          </div>

          <h2 className="text-xl font-semibold text-gray-900 mb-4">Paper</h2>
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
