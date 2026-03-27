import Head from "next/head";
import Link from "next/link";
import Navbar from "../../components/Navbar";
import Footer from "../../components/Footer";

export default function AutonomousDrone() {
  return (
    <>
      <Head>
        <title>Autonomous FPV Drone - Shiv Gupta</title>
      </Head>

      <Navbar />

      <main className="pt-16">
        <article className="max-w-3xl mx-auto px-6 py-24">
          <Link href="/#projects" className="text-sm text-blue-600 hover:underline mb-6 inline-block">
            &larr; Back to Projects
          </Link>

          <h1 className="text-4xl font-bold text-gray-900 mb-2">
            Autonomous FPV Drone
          </h1>
          <div className="flex flex-wrap gap-2 mb-4">
            <span className="text-xs px-2 py-1 rounded-full bg-gray-100 text-gray-600">ROS</span>
            <span className="text-xs px-2 py-1 rounded-full bg-gray-100 text-gray-600">C++</span>
            <span className="text-xs px-2 py-1 rounded-full bg-gray-100 text-gray-600">Computer Vision</span>
            <span className="text-xs text-gray-400 ml-2">2024</span>
          </div>

          <div className="prose prose-gray max-w-none mb-12">
            <p className="text-gray-600 leading-relaxed mb-6">
              Engineered an end-to-end autonomous navigation system using ROS, implementing PID controllers, computer vision pipelines, and path planning for real-time beacon identification and obstacle avoidance.
            </p>
          </div>

          <h2 className="text-xl font-semibold text-gray-900 mb-4">Demo Video</h2>
          <div className="border border-gray-200 rounded-lg overflow-hidden bg-gray-50">
            <div className="relative w-full" style={{ paddingBottom: "56.25%" }}>
              <iframe
                src="https://drive.google.com/file/d/1q6t1lj6cP6v9freTHnrVP7j_K1OAIBSC/preview"
                width="100%"
                height="100%"
                allow="autoplay"
                allowFullScreen
                className="absolute top-0 left-0 w-full h-full border-0"
              />
            </div>
          </div>
        </article>
      </main>

      <Footer />
    </>
  );
}
