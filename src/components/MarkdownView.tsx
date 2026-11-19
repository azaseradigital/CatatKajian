import React from "react";

interface MarkdownViewProps {
  content: string;
  className?: string;
}

function renderInline(text: string): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  const tokenRegex = /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let keyIdx = 0;

  while ((match = tokenRegex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }
    const token = match[0];
    if (token.startsWith("**") && token.endsWith("**")) {
      parts.push(
        <strong key={keyIdx++} className="font-semibold text-slate-900">
          {token.slice(2, -2)}
        </strong>
      );
    } else if (token.startsWith("*") && token.endsWith("*")) {
      parts.push(
        <em key={keyIdx++} className="italic text-slate-800">
          {token.slice(1, -1)}
        </em>
      );
    } else if (token.startsWith("`") && token.endsWith("`")) {
      parts.push(
        <code
          key={keyIdx++}
          className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[13px] text-slate-800"
        >
          {token.slice(1, -1)}
        </code>
      );
    }
    lastIndex = tokenRegex.lastIndex;
  }

  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return parts;
}

export const MarkdownView: React.FC<MarkdownViewProps> = ({
  content,
  className = "",
}) => {
  const lines = content.split(/\r?\n/);
  const elements: React.ReactNode[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    if (!trimmed) {
      i++;
      continue;
    }

    if (trimmed.startsWith("### ")) {
      elements.push(
        <h4
          key={i}
          dir="auto"
          className="mt-5 mb-2 text-[15px] font-semibold text-slate-900 first:mt-0"
        >
          {renderInline(trimmed.slice(4))}
        </h4>
      );
      i++;
      continue;
    }

    if (trimmed.startsWith("## ")) {
      elements.push(
        <h3
          key={i}
          dir="auto"
          className="mt-6 mb-2.5 border-b border-slate-200 pb-1.5 font-display text-lg font-semibold text-slate-900 first:mt-0"
        >
          {renderInline(trimmed.slice(3))}
        </h3>
      );
      i++;
      continue;
    }

    if (trimmed.startsWith("# ")) {
      elements.push(
        <h2
          key={i}
          dir="auto"
          className="mt-6 mb-3 font-display text-xl font-semibold text-slate-900 first:mt-0"
        >
          {renderInline(trimmed.slice(2))}
        </h2>
      );
      i++;
      continue;
    }

    if (trimmed.startsWith("> ")) {
      const quoteLines: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith("> ")) {
        quoteLines.push(lines[i].trim().slice(2));
        i++;
      }
      elements.push(
        <blockquote
          key={`q-${i}`}
          dir="auto"
          className="my-3 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-[15px] leading-relaxed text-slate-700"
        >
          {quoteLines.map((ql, idx) => (
            <p key={idx} className={idx > 0 ? "mt-1.5" : ""}>
              {renderInline(ql)}
            </p>
          ))}
        </blockquote>
      );
      continue;
    }

    if (/^[-*]\s+/.test(trimmed)) {
      const items: string[] = [];
      while (i < lines.length && /^[-*]\s+/.test(lines[i].trim())) {
        items.push(lines[i].trim().replace(/^[-*]\s+/, ""));
        i++;
      }
      elements.push(
        <ul key={`ul-${i}`} className="my-2.5 space-y-1.5 pl-5 list-disc text-[15px] leading-relaxed text-slate-700">
          {items.map((item, idx) => (
            <li key={idx} dir="auto">
              {renderInline(item)}
            </li>
          ))}
        </ul>
      );
      continue;
    }

    if (/^\d+\.\s+/.test(trimmed)) {
      const items: string[] = [];
      while (i < lines.length && /^\d+\.\s+/.test(lines[i].trim())) {
        items.push(lines[i].trim().replace(/^\d+\.\s+/, ""));
        i++;
      }
      elements.push(
        <ol key={`ol-${i}`} className="my-2.5 space-y-1.5 pl-5 list-decimal text-[15px] leading-relaxed text-slate-700">
          {items.map((item, idx) => (
            <li key={idx} dir="auto">
              {renderInline(item)}
            </li>
          ))}
        </ol>
      );
      continue;
    }

    if (trimmed === "---" || trimmed === "***") {
      elements.push(<hr key={`hr-${i}`} className="my-4 border-slate-200" />);
      i++;
      continue;
    }

    elements.push(
      <p
        key={i}
        dir="auto"
        className="my-2.5 text-[15px] leading-[1.7] text-slate-700 first:mt-0"
      >
        {renderInline(trimmed)}
      </p>
    );
    i++;
  }

  return <div className={`w-full max-w-[72ch] break-words ${className}`}>{elements}</div>;
};
