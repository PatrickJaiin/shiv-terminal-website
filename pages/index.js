import { useState } from "react";
import Head from "next/head";
import Link from "next/link";
import Navbar from "../components/Navbar";
import ProjectCard from "../components/ProjectCard";
import Footer from "../components/Footer";
import { siteData } from "../utils/data";
import { blogPosts } from "../utils/blog";
import { thoughts } from "../utils/thoughts";

export default function Home() {
  const [sortOrder, setSortOrder] = useState("newest");
  return (
    <>
      <Head>
        <title>{siteData.name}</title>
        <meta name="description" content={siteData.tagline} />
      </Head>

      <Navbar />

      <main className="pt-16">
        {/* About / Hero */}
        <section
          id="about"
          className="min-h-screen flex items-center bg-white dark:bg-gray-950"
        >
          <div className="max-w-3xl mx-auto px-6 py-24">
            <h1 className="text-5xl font-bold text-gray-900 dark:text-gray-100 mb-2">
              {siteData.name}
            </h1>
            <p className="text-xl text-blue-600 dark:text-blue-400 mb-6">{siteData.tagline}</p>
            <p className="text-gray-600 dark:text-gray-300 mb-10 leading-relaxed">
              {siteData.about}
            </p>

            {/* Education - block cards */}
            <div className="mb-8">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-4">
                Education
              </h2>
              <div className="space-y-4">
                {siteData.education.map((edu) => (
                  <div
                    key={edu.institution}
                    className="border border-gray-200 dark:border-gray-800 rounded-lg p-5 bg-gray-50 dark:bg-gray-900"
                  >
                    <div className="flex items-start justify-between">
                      <div>
                        <h3 className="font-semibold text-gray-900 dark:text-gray-100">
                          {edu.institution}
                        </h3>
                        <p className="text-sm text-gray-600 dark:text-gray-400">{edu.degree}</p>
                      </div>
                      <div className="text-right shrink-0 ml-4">
                        {edu.date && (
                          <span className="text-sm text-gray-500 dark:text-gray-400">{edu.date}</span>
                        )}
                        {edu.gpa && (
                          <p className="text-xs text-gray-400 dark:text-gray-500">{edu.gpa}</p>
                        )}
                      </div>
                    </div>
                    {edu.coursework && (
                      <p className="text-xs text-gray-400 dark:text-gray-500 mt-2">
                        <span className="font-medium text-gray-500 dark:text-gray-400">Coursework:</span>{" "}
                        {edu.coursework}
                      </p>
                    )}
                    {edu.activities && (
                      <p className="text-xs text-gray-400 dark:text-gray-500 mt-2">
                        <span className="font-medium text-gray-500 dark:text-gray-400">Activities:</span>{" "}
                        {edu.activities}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Skills */}
            <div>
              <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-4">
                Skills
              </h2>
              {Object.entries(siteData.skills).map(([category, items]) => (
                <div key={category} className="mb-3">
                  <span className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
                    {category === "ai" ? "AI / ML" : category === "programming" ? "Programming" : "Other"}
                  </span>
                  <div className="flex flex-wrap gap-2 mt-1">
                    {items.map((skill) => (
                      <span
                        key={skill}
                        className="text-sm px-3 py-1 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300"
                      >
                        {skill}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Projects */}
        <section id="projects" className="bg-gray-50 dark:bg-gray-900 py-24">
          <div className="max-w-5xl mx-auto px-6">
            <div className="flex items-center justify-between mb-10">
              <h2 className="text-3xl font-bold text-gray-900 dark:text-gray-100">Projects</h2>
              <button
                onClick={() => setSortOrder(sortOrder === "newest" ? "oldest" : "newest")}
                className="flex items-center gap-1.5 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-1.5 hover:border-gray-400 dark:hover:border-gray-600 transition-colors bg-white dark:bg-gray-950"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
                </svg>
                {sortOrder === "newest" ? "Newest first" : "Oldest first"}
              </button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {[...siteData.projects]
                .sort((a, b) =>
                  sortOrder === "newest"
                    ? Number(b.year) - Number(a.year)
                    : Number(a.year) - Number(b.year)
                )
                .map((project) => (
                  <ProjectCard
                    key={project.name}
                    title={project.name}
                    description={project.description}
                    stack={project.stack}
                    link={project.link}
                    year={project.year}
                    locked={project.locked}
                    type={project.type}
                  />
                ))}
            </div>
          </div>
        </section>

        {/* Blog - inline cards */}
        <section id="blog" className="bg-white dark:bg-gray-950 py-24">
          <div className="max-w-3xl mx-auto px-6">
            <h2 className="text-3xl font-bold text-gray-900 dark:text-gray-100 mb-4">Blog</h2>
            <p className="text-gray-500 dark:text-gray-400 mb-8">
              Thoughts on AI, cybersecurity, development, and more.
            </p>
            <div className="space-y-6">
              {blogPosts.map((post) => (
                <article
                  key={post.slug}
                  className="border border-gray-200 dark:border-gray-800 rounded-lg p-5 hover:shadow-md dark:hover:shadow-black/40 transition-shadow bg-gray-50 dark:bg-gray-900"
                >
                  <div className="flex items-center justify-between mb-1">
                    <a href={post.source || `/blog/${post.slug}`} target={post.source ? "_blank" : undefined} rel={post.source ? "noopener noreferrer" : undefined} className="font-semibold text-gray-900 dark:text-gray-100 no-underline hover:text-blue-600 dark:hover:text-blue-400 transition-colors">
                      {post.title}{post.source ? " ↗" : ""}
                    </a>
                    <span className="text-xs text-gray-400 dark:text-gray-500 shrink-0 ml-4">{post.date}</span>
                  </div>
                  <p className="text-sm text-gray-500 dark:text-gray-400">{post.excerpt}</p>
                </article>
              ))}
            </div>
            <div className="mt-8">
              <Link href="/blog" className="text-blue-600 dark:text-blue-400 hover:underline text-sm font-medium">
                View all posts &rarr;
              </Link>
            </div>
          </div>
        </section>

        {/* BrainAttic */}
        <section id="brainattic" className="bg-gray-50 dark:bg-gray-900 py-24">
          <div className="max-w-3xl mx-auto px-6">
            <h2 className="text-3xl font-bold text-gray-900 dark:text-gray-100 mb-2">BrainAttic</h2>
            <p className="text-gray-500 dark:text-gray-400 mb-10">
              Yes, it's a Sherlock Holmes reference.
            </p>
            <div className="space-y-8">
              {thoughts.map((group) => {
                const dotColor = {
                  blue: "bg-blue-400",
                  green: "bg-green-400",
                  red: "bg-red-400",
                  amber: "bg-amber-400",
                  purple: "bg-purple-400",
                }[group.color];
                return (
                  <div key={group.domain}>
                    <div className="flex items-center gap-2 mb-3">
                      <span className={`w-2 h-2 rounded-full ${dotColor}`} />
                      <h3 className="text-sm font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                        {group.domain}
                      </h3>
                    </div>
                    <div className="space-y-4 pl-4 border-l-2 border-gray-200 dark:border-gray-800">
                      {group.items.map((thought, i) => (
                        <div key={i}>
                          <p className="text-sm text-gray-600 dark:text-gray-300 leading-relaxed italic">
                            &ldquo;{thought.text}&rdquo;
                          </p>
                          {thought.source && (
                            <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                              &mdash; {thought.source}
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* Contact */}
        <section id="contact" className="bg-white dark:bg-gray-950 py-24">
          <div className="max-w-3xl mx-auto px-6 text-center">
            <h2 className="text-3xl font-bold text-gray-900 dark:text-gray-100 mb-6">Contact</h2>
            <p className="text-gray-500 dark:text-gray-400 mb-8">
              Feel free to reach out through any of the links below.
            </p>
            <div className="flex justify-center gap-8">
              {siteData.contacts.map((c) => (
                <a
                  key={c.medium}
                  href={c.link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 dark:text-blue-400 hover:underline font-medium"
                >
                  {c.medium}
                </a>
              ))}
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </>
  );
}
