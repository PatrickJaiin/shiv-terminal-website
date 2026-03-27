import Link from "next/link";

export default function ProjectCard({ title, description, stack, link, year }) {
  const card = (
    <div className="border border-gray-200 rounded-lg p-6 hover:shadow-md transition-shadow bg-white cursor-pointer h-full">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
        {year && <span className="text-xs text-gray-400">{year}</span>}
      </div>
      <p className="text-sm text-gray-500 mb-4">{description}</p>
      <div className="flex flex-wrap gap-2">
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
