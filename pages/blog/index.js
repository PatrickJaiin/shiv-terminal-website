import Head from "next/head";
import Link from "next/link";
import Navbar from "../../components/Navbar";
import Footer from "../../components/Footer";
import { blogPosts } from "../../utils/blog";

export default function Blog() {
  return (
    <>
      <Head>
        <title>Blog - Shiv Gupta</title>
      </Head>

      <Navbar />

      <main className="pt-16">
        <section className="max-w-3xl mx-auto px-6 py-24">
          <h1 className="text-4xl font-bold text-gray-900 mb-2">Blog</h1>
          <p className="text-gray-500 mb-12">
            Thoughts on cybersecurity, development, and more.
          </p>

          <div className="space-y-10">
            {blogPosts.map((post) => (
              <article key={post.slug}>
                <p className="text-sm text-gray-400 mb-1">{post.date}</p>
                <h2 className="text-xl font-semibold text-gray-900 mb-1">
                  {post.title}
                </h2>
                <p className="text-gray-500">{post.excerpt}</p>
              </article>
            ))}
          </div>
        </section>
      </main>

      <Footer />
    </>
  );
}
