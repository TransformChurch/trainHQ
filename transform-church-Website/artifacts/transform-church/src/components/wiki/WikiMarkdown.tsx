import { Fragment, type ReactNode } from "react";

// Renders a small, deliberately-limited markdown subset used only by Wiki article
// content: "## " / "### " headings, "- " bullet lists, "1. " numbered lists,
// "**bold**" emphasis, "[text](url)" links, and blank-line-separated paragraphs.
// Nothing else is supported by design — content is authored to this exact subset.

function renderInline(text: string, keyPrefix: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  const pattern = /\*\*(.+?)\*\*|\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let index = 0;
  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(<Fragment key={`${keyPrefix}-t${index++}`}>{text.slice(lastIndex, match.index)}</Fragment>);
    }
    if (match[1] !== undefined) {
      nodes.push(<strong key={`${keyPrefix}-b${index++}`}>{match[1]}</strong>);
    } else if (match[2] !== undefined && match[3] !== undefined) {
      nodes.push(
        <a
          key={`${keyPrefix}-a${index++}`}
          href={match[3]}
          target="_blank"
          rel="noopener noreferrer"
          className="text-primary underline underline-offset-2 hover:no-underline"
        >
          {match[2]}
        </a>,
      );
    }
    lastIndex = pattern.lastIndex;
  }
  if (lastIndex < text.length) {
    nodes.push(<Fragment key={`${keyPrefix}-t${index++}`}>{text.slice(lastIndex)}</Fragment>);
  }
  return nodes;
}

type Block =
  | { type: "h2" | "h3"; text: string }
  | { type: "ul" | "ol"; items: string[] }
  | { type: "p"; text: string };

function parseBlocks(content: string): Block[] {
  const lines = content.replace(/\r\n/g, "\n").split("\n");
  const blocks: Block[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (line.trim() === "") {
      i++;
      continue;
    }
    if (line.startsWith("### ")) {
      blocks.push({ type: "h3", text: line.slice(4).trim() });
      i++;
      continue;
    }
    if (line.startsWith("## ")) {
      blocks.push({ type: "h2", text: line.slice(3).trim() });
      i++;
      continue;
    }
    if (/^-\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^-\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^-\s+/, ""));
        i++;
      }
      blocks.push({ type: "ul", items });
      continue;
    }
    if (/^\d+\.\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\d+\.\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\d+\.\s+/, ""));
        i++;
      }
      blocks.push({ type: "ol", items });
      continue;
    }
    const paragraphLines: string[] = [];
    while (i < lines.length && lines[i].trim() !== "" && !lines[i].startsWith("## ") && !lines[i].startsWith("### ") && !/^-\s+/.test(lines[i]) && !/^\d+\.\s+/.test(lines[i])) {
      paragraphLines.push(lines[i]);
      i++;
    }
    blocks.push({ type: "p", text: paragraphLines.join(" ") });
  }
  return blocks;
}

export function WikiMarkdown({ content, className }: { content: string; className?: string }) {
  const blocks = parseBlocks(content);
  return (
    <div className={className ?? "space-y-4"}>
      {blocks.map((block, blockIndex) => {
        const key = `b${blockIndex}`;
        if (block.type === "h2") {
          return <h2 key={key} className="text-xl font-bold font-serif mt-8 first:mt-0">{renderInline(block.text, key)}</h2>;
        }
        if (block.type === "h3") {
          return <h3 key={key} className="text-base font-semibold mt-6 first:mt-0">{renderInline(block.text, key)}</h3>;
        }
        if (block.type === "ul") {
          return (
            <ul key={key} className="list-disc space-y-1.5 pl-5 text-sm leading-relaxed">
              {block.items.map((item, itemIndex) => (
                <li key={`${key}-${itemIndex}`}>{renderInline(item, `${key}-${itemIndex}`)}</li>
              ))}
            </ul>
          );
        }
        if (block.type === "ol") {
          return (
            <ol key={key} className="list-decimal space-y-1.5 pl-5 text-sm leading-relaxed">
              {block.items.map((item, itemIndex) => (
                <li key={`${key}-${itemIndex}`}>{renderInline(item, `${key}-${itemIndex}`)}</li>
              ))}
            </ol>
          );
        }
        return <p key={key} className="text-sm leading-relaxed text-foreground/90">{renderInline(block.text, key)}</p>;
      })}
    </div>
  );
}
