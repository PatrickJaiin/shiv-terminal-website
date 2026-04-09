import Link from "next/link";

const TYPE_BADGE = {
  tool:        { label: "Interactive Tool",    bg: "bg-emerald-100", text: "text-emerald-700", border: "border-emerald-200" },
  interactive: { label: "Interactive Project", bg: "bg-emerald-100", text: "text-emerald-700", border: "border-emerald-200" },
  demo:        { label: "Demo",               bg: "bg-blue-100",    text: "text-blue-700",    border: "border-blue-200" },
  report:      { label: "Research Report",     bg: "bg-purple-100",  text: "text-purple-700",  border: "border-purple-200" },
  paper:       { label: "Research Paper",      bg: "bg-purple-100",  text: "text-purple-700",  border: "border-purple-200" },
  "ext-report":{ label: "External Report",     bg: "bg-gray-100",    text: "text-gray-500",    border: "border-gray-200", external: true },
  "ext-app":   { label: "External Application",bg: "bg-gray-100",    text: "text-gray-500",    border: "border-gray-200", external: true },
};

export default function ProjectCard({ title, description, stack, link, year, locked, type }) {
  const badge = type ? TYPE_BADGE[type] : null;
  const isExternal = badge?.external || (link && !link.startsWith("/"));

  const card = (
    <div className="border border-gray-200 rounded-lg p-6 hover:shadow-md transition-shadow bg-white cursor-pointer h-full">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <h3 className="text-lg font-semibold text-gray-900">
            {title}{isExternal ? " \u2197" : ""}
          </h3>
          {locked && (
            <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
            </svg>
          )}
        </div>
        {year && <span className="text-xs text-gray-400 shrink-0">{year}</span>}
      </div>
      <p className="text-sm text-gray-500 mb-4">{description}</p>
      <div className="flex flex-wrap gap-2">
        {badge && (
          <span className={`text-xs px-2 py-1 rounded-full border font-medium ${badge.bg} ${badge.text} ${badge.border}`}>
            {badge.label}
          </span>
        )}
        {stack.map((tech) => (
          <span
            key={tech}
            className="text-xs px-2 py-1 rounded-full bg-gray-100 text-gray-600"
          >
            {tech}
          </span>
        ))}
      </div>
    </div>
  );

  if (!link) return card;

  if (link.startsWith("/")) {
    return (
      <Link href={link} style={{ textDecoration: "none", color: "inherit", display: "block" }}>
        {card}
      </Link>
    );
  }

  return (
    <a href={link} target="_blank" rel="noopener noreferrer" style={{ textDecoration: "none", color: "inherit", display: "block" }}>
      {card}
    </a>
  );
}
