import Head from "next/head";
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

      <main className="pt-16 bg-white dark:bg-gray-950 min-h-screen">
        <section className="max-w-3xl mx-auto px-6 py-24">
          <h1 className="text-4xl font-bold text-gray-900 dark:text-gray-100 mb-2">Blog</h1>
          <p className="text-gray-500 dark:text-gray-400 mb-12">
            Thoughts on cybersecurity, development, and more.
          </p>

          <div className="space-y-10">
            {blogPosts.map((post) => (
              <article key={post.slug}>
                <p className="text-sm text-gray-400 dark:text-gray-500 mb-1">{post.date}</p>
                <a href={post.source || `/blog/${post.slug}`} target={post.source ? "_blank" : undefined} rel={post.source ? "noopener noreferrer" : undefined} className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-1 hover:text-blue-600 dark:hover:text-blue-400 transition-colors no-underline block">
                  {post.title}{post.source ? " ↗" : ""}
                </a>
                <p className="text-gray-500 dark:text-gray-400">{post.excerpt}</p>
              </article>
            ))}
          </div>
        </section>
      </main>

      <Footer />
    </>
  );
}
