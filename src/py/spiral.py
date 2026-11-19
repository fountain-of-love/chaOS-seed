"""Observe, apply, and learn policy without filesystem access."""

import re

from .growth import NOTICED_WEIGHT, is_variation_check, ladder_stage


DEFAULT_REFLECT_EVERY = 14
LESSONS_SHOWN = 3
COUNTER = "promptsSinceReflection"
MOMENT = "lastReflectionAt"

SPIRAL = (
    "Open your reply with one line `intent: <what the person wants, in one clear sentence>`.",
    "Without repetition, a dance suffices. With repetition, a system emerges; it needs governance.",
)


def is_reflection_due(count, reflect_every=DEFAULT_REFLECT_EVERY):
    return count > 0 and reflect_every > 0 and count % reflect_every == 0


def describe_relation(relation):
    return f'{relation["from"]} → {relation["type"]} → {relation["to"]}'


def lessons_from(relations, count=LESSONS_SHOWN):
    ranked = sorted(
        (relation for relation in relations if relation["weight"] >= NOTICED_WEIGHT),
        key=lambda relation: relation["weight"],
        reverse=True,
    )
    return [
        f'{describe_relation(relation)} ({relation["weight"]}, {ladder_stage(relation["weight"])})'
        for relation in ranked[:count]
    ]


def build_context(relations=(), prompts_since_reflection=0, reflect_every=DEFAULT_REFLECT_EVERY):
    lines = list(SPIRAL)
    lessons = lessons_from(relations)
    if lessons:
        lines.extend(["Learned here (weight, stage):", *(f"- {lesson}" for lesson in lessons)])
    if is_variation_check(prompts_since_reflection):
        lines.append(
            f"Variation check (prompt {prompts_since_reflection}): name what changed that the structure did not "
            "plan for, before you follow the pattern."
        )
    if is_reflection_due(prompts_since_reflection, reflect_every):
        lines.append(
            f"Reflection is due ({prompts_since_reflection} prompts since the last one). "
            "After this request, offer to run `spiral reflect`."
        )
    return "\n".join(lines)


def stated_intent(reply):
    first = str(reply or "").lstrip().split("\n", 1)[0].strip().strip("`")
    match = re.fullmatch(r"intent:\s*(.+)", first, re.IGNORECASE)
    return match[1].strip() if match else None


def strengthen(relations, relation, evidence):
    identity = ("from", "type", "to")

    def same(candidate):
        return all(candidate[field] == relation[field] for field in identity)

    current = next((candidate for candidate in relations if same(candidate)), None)
    if current is None:
        unique = list(dict.fromkeys(evidence))
        return [*relations, {**relation, "weight": len(unique), "evidence": unique}]

    original = current["evidence"]
    added = list(dict.fromkeys(item for item in evidence if item not in original))
    updated = {**current, "weight": current["weight"] + len(added), "evidence": [*original, *added]}
    return [updated if same(candidate) else candidate for candidate in relations]


def review_journal(events, since=None):
    by_day, groups = {}, {}
    total = 0
    for event in events:
        if event["type"] != "prompt" or (since and event["at"] < since):
            continue
        total += 1
        day = event["at"][:10]
        by_day[day] = by_day.get(day, 0) + 1
        text = " ".join(str(event["data"].get("text") or "").split()).lower()
        if text:
            groups.setdefault(text, []).append(event["id"])
    repeats = [
        {"text": text, "count": len(ids), "evidence": ids}
        for text, ids in groups.items() if len(ids) > 1
    ]
    repeats.sort(key=lambda repeat: repeat["count"], reverse=True)
    return {"prompts": total, "byDay": by_day, "repeats": repeats}
