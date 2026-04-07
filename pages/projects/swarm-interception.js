import Head from "next/head";
import Link from "next/link";
import Navbar from "../../components/Navbar";
import Footer from "../../components/Footer";

export default function SwarmInterception() {
  return (
    <>
      <Head>
        <title>Swarm Interception - Shiv Gupta</title>
      </Head>

      <Navbar />

      <main className="pt-16">
        <article className="max-w-3xl mx-auto px-6 py-24">
          <Link href="/#projects" className="text-sm text-blue-600 hover:underline mb-6 inline-block">
            &larr; Back to Projects
          </Link>

          <h1 className="text-4xl font-bold text-gray-900 mb-2">
            Swarm Interception
          </h1>
          <div className="flex flex-wrap gap-2 mb-4">
            <span className="text-xs px-2 py-1 rounded-full bg-gray-100 text-gray-600">Python</span>
            <span className="text-xs px-2 py-1 rounded-full bg-gray-100 text-gray-600">ROS2</span>
            <span className="text-xs px-2 py-1 rounded-full bg-gray-100 text-gray-600">Reinforcement Learning</span>
            <span className="text-xs px-2 py-1 rounded-full bg-gray-100 text-gray-600">PyTorch</span>
            <span className="text-xs px-2 py-1 rounded-full bg-gray-100 text-gray-600">Gazebo</span>
            <span className="text-xs text-gray-400 ml-2">2026</span>
          </div>

          <div className="prose prose-gray max-w-none mb-12">
            <p className="text-gray-600 leading-relaxed mb-6">
              Autonomous drone swarm system for intercepting attack drones. Currently the testing engine for the interception drone is working - now building RL-based coordination for swarm drones to intercept attack drones.
            </p>

            <h2 className="text-xl font-semibold text-gray-900 mb-4">Current Status</h2>

            <div className="border border-gray-200 rounded-xl overflow-hidden mb-6">
              <div className="bg-gray-50 px-5 py-3 flex items-center justify-between border-b border-gray-200">
                <div className="flex items-center gap-3">
                  <span className="bg-green-600 text-white text-xs font-bold px-2.5 py-1 rounded-full">1</span>
                  <h3 className="font-semibold text-gray-800">Interception Drone Testing Engine</h3>
                </div>
                <span className="text-xs font-medium px-2.5 py-1 rounded-full border bg-green-100 text-green-700 border-green-200">
                  Complete
                </span>
              </div>
              <div className="p-5">
                <p className="text-sm text-gray-600">
                  Single-drone interception engine built and tested - handles target tracking, trajectory prediction, and intercept maneuvers.
                </p>
              </div>
            </div>

            <div className="border border-gray-200 rounded-xl overflow-hidden mb-6">
              <div className="bg-gray-50 px-5 py-3 flex items-center justify-between border-b border-gray-200">
                <div className="flex items-center gap-3">
                  <span className="bg-yellow-500 text-white text-xs font-bold px-2.5 py-1 rounded-full">2</span>
                  <h3 className="font-semibold text-gray-800">RL-Based Swarm Coordination</h3>
                </div>
                <span className="text-xs font-medium px-2.5 py-1 rounded-full border bg-yellow-100 text-yellow-700 border-yellow-200">
                  In Progress
                </span>
              </div>
              <div className="p-5">
                <p className="text-sm text-gray-600">
                  Training reinforcement learning agents for multi-drone swarm coordination to intercept multiple attack drones simultaneously.
                </p>
              </div>
            </div>
          </div>

          <a
            href="https://github.com/PatrickJaiin/swarm-interception"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 text-sm font-medium text-white bg-gray-900 px-4 py-2 rounded-lg hover:bg-gray-700 transition-colors"
          >
            View on GitHub &rarr;
          </a>
        </article>
      </main>

      <Footer />
    </>
  );
}
