import json
import re

from behave import step
from chaos_seed import contract, formats, growth, spiral
from python_workspace import ROOT, external_imports


VALIDATORS = {
    "event": contract.validate_event,
    "state": contract.validate_state,
    "relation": contract.validate_relation,
}


@step("the runtime has no external application imports")
def check_application_imports(_context):
    violations = external_imports()
    assert not violations, violations


@step("the required fields of each record match CONTRACT.md")
def check_record_fields(_context):
    lines = (ROOT / "CONTRACT.md").read_text(encoding="utf-8").splitlines()
    for kind, fields in (
        ("event", contract.EVENT_FIELDS), ("state", contract.STATE_FIELDS), ("relation", contract.RELATION_FIELDS)
    ):
        row = next(line for line in lines if f"| {kind}:" in line)
        documented = re.findall(r"`([^`]+)`", row.split("|")[-2])
        assert len(fields) == 5, kind
        assert list(fields) == documented, (kind, fields, documented)


@step("these example records:")
def load_example_records(context):
    context.records = json.loads(context.text)


@step("these extensions are accepted:")
def check_extensions(context):
    for row in context.table:
        kind = row["record"]
        record = {**context.records[kind], **json.loads(row["extra fields"])}
        errors = VALIDATORS[kind](record)
        assert not errors, (kind, errors)


@step("these invalid records are explained:")
def check_invalid_records(context):
    for row in context.table:
        kind = row["record"]
        changes = json.loads(row["change"])
        removed = changes.pop("remove", [])
        record = {**context.records[kind], **changes}
        for field in removed:
            del record[field]
        if changes.get("weight") == "NaN":
            record["weight"] = float("nan")
        errors = VALIDATORS[kind](record)
        assert any(row["error"] in error for error in errors), (row["error"], errors)


@step("these state details:")
def load_state_details(context):
    context.state_details = json.loads(context.text)


@step("these relations:")
def load_relations(context):
    context.relations = json.loads(context.text)


@step("I render the state")
def render_state(context):
    context.rendered = formats.render_frontmatter(**context.state_details)


@step("I render the memory graph")
def render_memory(context):
    context.rendered = formats.render_dot(context.relations)


@step("the rendered text starts with:")
def check_rendered_prefix(context):
    assert context.rendered.startswith(context.text), context.rendered


@step("the rendered text contains:")
def check_rendered_text(context):
    assert context.text in context.rendered, context.rendered


@step("reading the rendered state returns the original metadata and body")
def check_state_round_trip(context):
    meta, body = formats.parse_frontmatter(context.rendered)
    assert {"meta": meta, "body": body} == context.state_details


@step("reading the rendered graph returns the original relations")
def check_graph_round_trip(context):
    assert formats.parse_dot(context.rendered) == (context.relations, [])


@step("I read this state document:")
def parse_state(context):
    meta, body = formats.parse_frontmatter(context.text)
    context.value = {"meta": meta, "body": body}


@step("I read this memory graph:")
def parse_graph(context):
    relations, skipped = formats.parse_dot(context.text)
    context.value = {"relations": relations, "skipped": skipped}


@step("the result is:")
def check_result(context):
    expected = json.loads(context.text)
    assert context.value == expected, (context.value, expected)


@step("weights produce these growth stages:")
def check_growth_stages(context):
    for row in context.table:
        assert growth.ladder_stage(int(row["weight"])) == row["stage"], row


@step("the variation checks from prompt {int} through {int} occur at {string}")
def check_variation_counts(_context, start, end, expected):
    checks = [count for count in range(start, end + 1) if growth.is_variation_check(count)]
    assert checks == [int(count) for count in expected.split(",")], checks


@step("I build context after {int} prompts with a reflection interval of {int}")
def build_context(context, count, interval):
    context.agent_context = spiral.build_context(context.relations, count, interval)


@step("the context mentions {string}")
def check_context_includes(context, part):
    assert part in context.agent_context, context.agent_context


@step("the context omits {string}")
def check_context_omits(context, part):
    assert part not in context.agent_context, context.agent_context


@step("with a reflection interval of {int} these counts are due:")
def check_reflection_counts(context, interval):
    for row in context.table:
        assert spiral.is_reflection_due(int(row["count"]), interval) == (row["due"] == "true"), row


@step("these replies state the following intents:")
def check_reply_intents(context):
    for reply, intent in json.loads(context.text):
        assert spiral.stated_intent(reply) == intent, reply


@step("I strengthen memory with:")
def strengthen_memory(context):
    context.strengthening_input = context.text
    scenario = json.loads(context.strengthening_input)
    context.original_relations = scenario["before"]
    first, second = scenario["first"], scenario["second"]
    after_first = spiral.strengthen(context.original_relations, first["relation"], first["evidence"])
    context.strengthened = spiral.strengthen(after_first, second["relation"], second["evidence"])


@step("the original relations are unchanged")
def check_original_relations(context):
    assert context.original_relations == json.loads(context.strengthening_input)["before"]


@step("the strengthened memory has these weights and citations:")
def check_strengthened_memory(context):
    summary = [
        [" ".join(relation[key] for key in ("from", "type", "to")), str(relation["weight"]), ",".join(relation["evidence"])]
        for relation in context.strengthened
    ]
    assert summary == [row.cells for row in context.table], summary


@step("I review these events from {string}:")
def review_events(context, since):
    events = [
        {
            "id": row["id"], "at": row["at"], "type": row["type"],
            "actor": {"role": "person" if row["type"] == "prompt" else "agent"},
            "data": {"text": row["text"]},
        }
        for row in context.table
    ]
    context.value = spiral.review_journal(events, since)
