// The two file formats beside the journal's JSON lines:
//   MDX states: YAML frontmatter (the five elements) over a free-text body.
//   DOT relations: one directed, weighted edge per line inside `digraph memory { }`.
// Pure text in, text out.

const FRONTMATTER = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/;

function parseScalar(raw) {
  if (raw === "") return null;
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

export function parseFrontmatter(text) {
  const match = String(text).match(FRONTMATTER);
  if (!match) return { meta: {}, body: String(text) };
  const meta = {};
  for (const line of match[1].split("\n")) {
    const pair = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (pair) meta[pair[1]] = parseScalar(pair[2].trim());
  }
  return { meta, body: match[2] };
}

// Values are written as JSON, which is valid YAML, so any reader understands them.
export function renderFrontmatter(meta, body = "") {
  const lines = Object.entries(meta).map(([key, value]) => `${key}: ${JSON.stringify(value ?? null)}`);
  return `---\n${lines.join("\n")}\n---\n${body}`;
}

const QUOTED = String.raw`"((?:[^"\\]|\\.)*)"`;
const EDGE = new RegExp(String.raw`^\s*${QUOTED}\s*->\s*${QUOTED}\s*\[(.*)\]\s*;?\s*$`);
const ATTRIBUTE = /(\w+)\s*=\s*("(?:[^"\\]|\\.)*"|[^,\s\]]+)/g;
const unquote = (text) => text.replace(/\\(.)/g, "$1");
const quote = (text) => `"${String(text).replace(/(["\\])/g, "\\$1")}"`;

export function parseDot(text) {
  const relations = [];
  const skipped = [];
  for (const line of String(text).split("\n")) {
    const edge = line.match(EDGE);
    if (!edge) {
      if (line.includes("->")) skipped.push(line.trim());
      continue;
    }
    const attributes = {};
    for (const [, name, value] of edge[3].matchAll(ATTRIBUTE)) {
      attributes[name] = value.startsWith('"') ? unquote(value.slice(1, -1)) : value;
    }
    const { type, weight, evidence, ...extra } = attributes;
    relations.push({
      from: unquote(edge[1]),
      type,
      to: unquote(edge[2]),
      weight: Number(weight),
      evidence: evidence ? evidence.split(/\s+/).filter(Boolean) : [],
      ...(Object.keys(extra).length > 0 ? { extra } : {}),
    });
  }
  return { relations, skipped };
}

export function renderDot(relations) {
  const lines = relations.map((relation) => {
    const attributes = [
      `type=${quote(relation.type)}`,
      `weight=${relation.weight}`,
      `evidence=${quote(relation.evidence.join(" "))}`,
      ...Object.entries(relation.extra || {}).map(([name, value]) => `${name}=${quote(value)}`),
    ];
    return `  ${quote(relation.from)} -> ${quote(relation.to)} [${attributes.join(", ")}];`;
  });
  return `digraph memory {\n${lines.map((line) => `${line}\n`).join("")}}\n`;
}
