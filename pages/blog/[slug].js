import Head from "next/head";
import Link from "next/link";
import Navbar from "../../components/Navbar";
import Footer from "../../components/Footer";
import { blogPosts } from "../../utils/blog";

export async function getStaticPaths() {
  const paths = blogPosts
    .filter((post) => post.content)
    .map((post) => ({ params: { slug: post.slug } }));
  return { paths, fallback: false };
}

export async function getStaticProps({ params }) {
  const post = blogPosts.find((p) => p.slug === params.slug);
  if (!post) return { notFound: true };
  return { props: { post } };
}

export default function BlogPost({ post }) {
  return (
    <>
      <Head>
        <title>{post.title} - Shiv Gupta</title>
      </Head>

      <Navbar />

      <main className="pt-16">
        <article className="max-w-3xl mx-auto px-6 py-24">
          <Link href="/blog" className="text-blue-600 hover:underline text-sm">
            &larr; Back to blog
          </Link>
          <p className="text-sm text-gray-400 mt-6 mb-2">{post.date}</p>
          <h1 className="text-4xl font-bold text-gray-900 mb-8">
            {post.title}
          </h1>
          <div className="prose prose-gray max-w-none">
            {post.content
              .trim()
              .split("\n\n")
              .map((block, i) => {
                if (block.startsWith("## ")) {
                  return (
                    <h2
                      key={i}
                      className="text-2xl font-bold text-gray-900 mt-10 mb-4"
                    >
                      {block.replace("## ", "")}
                    </h2>
                  );
                }
                return (
                  <p key={i} className="text-gray-600 leading-relaxed mb-4">
                    {block}
                  </p>
                );
              })}
          </div>
        </article>
      </main>

      <Footer />
    </>
  );
}
