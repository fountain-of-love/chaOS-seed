"""Text codecs for the JSON-compatible MDX frontmatter and line-based DOT."""

import json
import re


FRONTMATTER = re.compile(r"^---\n(.*?)\n---\n?(.*)$", re.DOTALL)
FIELD = re.compile(r"^([A-Za-z0-9_-]+):\s*(.*)$")
QUOTED = r'"((?:[^"\\]|\\.)*)"'
EDGE = re.compile(rf"^\s*{QUOTED}\s*->\s*{QUOTED}\s*\[(.*)\]\s*;?\s*$")
ATTRIBUTE = re.compile(r'(\w+)\s*=\s*("(?:[^"\\]|\\.)*"|[^,\s\]]+)', re.ASCII)


def _invalid_json_constant(value):
    raise ValueError(f"Invalid JSON constant: {value}")


def load_json(text):
    return json.loads(text, parse_constant=_invalid_json_constant)


def dump_json(value):
    text = json.dumps(value, ensure_ascii=False, allow_nan=False, separators=(",", ":"))
    return text.encode("utf-8", errors="backslashreplace").decode("utf-8")


def parse_frontmatter(text):
    match = FRONTMATTER.match(text)
    if not match:
        return {}, text
    meta = {}
    for line in match[1].split("\n"):
        pair = FIELD.match(line)
        if pair:
            raw = pair[2].strip()
            try:
                meta[pair[1]] = load_json(raw) if raw else None
            except ValueError:
                meta[pair[1]] = raw
    return meta, match[2]


def render_frontmatter(meta, body=""):
    lines = "\n".join(f"{key}: {dump_json(value)}" for key, value in meta.items())
    return f"---\n{lines}\n---\n{body}"


def _unquote(text):
    return re.sub(r"\\(.)", r"\1", text)


def _quote(text):
    return '"' + str(text).replace("\\", "\\\\").replace('"', '\\"') + '"'


def _parse_weight(value):
    try:
        return int(value)
    except ValueError:
        try:
            number = float(value)
            return int(number) if number.is_integer() else number
        except ValueError:
            return float("nan")


def parse_dot(text):
    relations, skipped = [], []
    for line in text.split("\n"):
        edge = EDGE.match(line)
        if not edge:
            if "->" in line:
                skipped.append(line.strip())
            continue
        attributes = {
            name: _unquote(value[1:-1]) if value.startswith('"') else value
            for name, value in ATTRIBUTE.findall(edge[3])
        }
        relation = {
            "from": _unquote(edge[1]),
            "type": attributes.pop("type", None),
            "to": _unquote(edge[2]),
            "weight": _parse_weight(attributes.pop("weight", "")),
            "evidence": attributes.pop("evidence", "").split(),
        }
        if attributes:
            relation["extra"] = attributes
        relations.append(relation)
    return relations, skipped


def render_dot(relations):
    lines = ["digraph memory {"]
    for relation in relations:
        evidence = " ".join(relation["evidence"])
        attributes = [
            f'type={_quote(relation["type"])}',
            f'weight={relation["weight"]}',
            f"evidence={_quote(evidence)}",
        ]
        attributes.extend(f"{name}={_quote(value)}" for name, value in relation.get("extra", {}).items())
        source, target = _quote(relation["from"]), _quote(relation["to"])
        lines.append(f'  {source} -> {target} [{", ".join(attributes)}];')
    return "\n".join([*lines, "}", ""])
