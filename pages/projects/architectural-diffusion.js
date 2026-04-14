import Head from "next/head";
import Link from "next/link";
import Navbar from "../../components/Navbar";
import Footer from "../../components/Footer";

export default function ArchitecturalDiffusion() {
  return (
    <>
      <Head>
        <title>Diffusion Based Generative Modelling for Architectural Visualization - Shiv Gupta</title>
      </Head>

      <Navbar />

      <main className="pt-16">
        <article className="max-w-3xl mx-auto px-6 py-24">
          <Link href="/#projects" className="text-sm text-blue-600 hover:underline mb-6 inline-block">
            &larr; Back to Projects
          </Link>

          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            Diffusion Based Generative Modelling for Architectural Visualization
          </h1>
          <div className="flex flex-wrap gap-2 mb-4">
            <span className="text-xs px-2 py-1 rounded-full bg-gray-100 text-gray-600">Python</span>
            <span className="text-xs px-2 py-1 rounded-full bg-gray-100 text-gray-600">Diffusion Models</span>
            <span className="text-xs px-2 py-1 rounded-full bg-gray-100 text-gray-600">ControlNet</span>
            <span className="text-xs px-2 py-1 rounded-full bg-gray-100 text-gray-600">Computer Vision</span>
            <span className="text-xs text-gray-400 ml-2">2024</span>
          </div>

          <div className="flex flex-wrap gap-4 mb-10">
            <a
              href="https://drive.google.com/file/d/1gkgJtMgf-TnsmlfBQtnrR7EouxR8SxQM/view?usp=sharing"
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-blue-600 hover:underline font-medium"
            >
              Download Paper &rarr;
            </a>
          </div>

          <div className="prose prose-gray max-w-none mb-12">
            <p className="text-gray-600 leading-relaxed mb-6">
              Research conducted at the{" "}
              <a
                href="https://drive.google.com/file/d/15WIKAkMq1hQKcJTn6g_AqklP1XxrJdhv/view?usp=sharing"
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 hover:underline"
              >
                National University of Singapore
              </a>
              {" "}under the guidance of Dr Tan Wee Kek. Developed Diffusion and ControlNet based generative models for Interior and Exterior architectural design visualization.
            </p>
            <p className="text-gray-600 leading-relaxed">
              The project explores applying state-of-the-art diffusion-based generative AI techniques to architectural visualization, enabling the generation of realistic interior and exterior design renders from structural inputs using ControlNet conditioning.
            </p>
          </div>

          <h2 className="text-xl font-semibold text-gray-900 mb-4">Paper</h2>
          <div className="border border-gray-200 rounded-lg overflow-hidden bg-gray-50">
            <iframe
              src="https://drive.google.com/file/d/1gkgJtMgf-TnsmlfBQtnrR7EouxR8SxQM/preview"
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
