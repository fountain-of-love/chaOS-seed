from concurrent.futures import ThreadPoolExecutor
import json

from behave import step
from src.py.formats import render_frontmatter
from src.py.spiral import COUNTER, MOMENT
from python_workspace import ROOT


@step("this prompt history:")
def seed_history(context):
    events = [
        {"id": row["id"], "at": row["at"], "type": "prompt", "actor": {"role": "person"}, "data": {"text": row["text"]}}
        for row in context.table
    ]
    context.project.write(("journal.jsonl",), "".join(json.dumps(event) + "\n" for event in events))
    latest = events[-1]
    state = {"key": COUNTER, "value": len(events), "at": latest["at"], "cause": latest["id"], "version": len(events)}
    context.project.write(("state", f"{COUNTER}.mdx"), render_frontmatter(state))


@step("I run {string}")
def run_command(context, command):
    context.result = context.project.cli(command)


@step("I run {string} with these arguments:")
def run_command_with_arguments(context, command):
    context.result = context.project.cli(command, *json.loads(context.text))


@step("it exits with code {int}")
def check_exit_code(context, code):
    assert context.result.returncode == code, context.result.stderr


@step("stdout contains {string}")
def check_stdout_contains(context, part):
    assert part in context.result.stdout, context.result.stdout or context.result.stderr


@step("stderr contains {string}")
def check_stderr_contains(context, part):
    assert part in context.result.stderr, context.result.stderr


@step("stdout and stderr are empty")
def check_output_empty(context):
    assert context.result.stdout == context.result.stderr == ""


@step("stdout is empty")
def check_stdout_empty(context):
    assert context.result.stdout == "", context.result.stdout


@step("the prompt count is {int} at version {int}")
def check_counter(context, value, version):
    meta, _ = context.project.state()
    assert (meta["value"], meta["version"]) == (value, version), meta


@step("the reflection event caused both state updates")
def check_reflection_cause(context):
    event = context.project.journal()[-1]
    counter, _ = context.project.state()
    moment, _ = context.project.state(MOMENT)
    assert event["type"] == "reflection", event
    assert counter["cause"] == moment["cause"] == event["id"]
    assert moment["value"] == event["at"]


@step("the relation weighs {int} and has {int} evidence events")
def check_relation_weight(context, weight, count):
    relation, = context.project.memory()
    assert relation["weight"] == weight and len(relation["evidence"]) == count, relation


@step("no memory file was created")
def check_no_memory_file(context):
    assert not context.project.file("memory.dot").exists()


@step("the journal has no {string} event")
def check_no_journal_event(context, event_type):
    assert all(event["type"] != event_type for event in context.project.journal()), event_type


def workspace_files(project):
    return project.read("memory.dot"), project.read("journal.jsonl")


@step("I snapshot the memory and journal")
def snapshot_files(context):
    context.snapshot = workspace_files(context.project)


@step("memory and the journal match the snapshot")
def check_snapshot(context):
    assert workspace_files(context.project) == context.snapshot


@step("I add the unsupported edge {string} to memory")
def add_unsupported_edge(context, edge):
    graph = context.project.read("memory.dot").replace("}\n", f"  {edge}\n}}\n", 1)
    context.project.write(("memory.dot",), graph)


@step("{int} writers cite different evidence for {string} {word} {string}")
def remember_concurrently(context, count, source, verb, target):
    project = context.project

    def remember(index):
        return project.cli("remember", source, verb, target, "--evidence", f"e-{index}")

    with ThreadPoolExecutor(max_workers=count) as workers:
        for result in workers.map(remember, range(count)):
            assert result.returncode == 0, result.stderr


@step("the relation cites {string}")
def check_citations(context, evidence):
    relation, = context.project.memory()
    assert sorted(relation["evidence"]) == sorted(evidence.split(",")), relation


@step("a writer exits while holding the workspace lock")
def abandon_lock(context):
    script = (
        "import os, sys\n"
        "sys.path.insert(0, sys.argv[1])\n"
        "from src.py.workspace import Workspace\n"
        "with Workspace(os.getcwd()).mutation():\n"
        "    os._exit(0)\n"
    )
    result = context.project.run("-c", script, str(ROOT))
    assert result.returncode == 0, result.stderr
    assert result.stdout == "", result.stdout


@step("I try to record a prompt as {string}")
def record_prompt(context, role):
    workspace = context.project.storage
    with workspace.mutation():
        context.event = workspace.append_event("prompt", role, {"text": "hi"})


@step("the event is refused")
def check_event_refused(context):
    assert context.event is None, context.event


@step("the journal has no valid events")
def check_empty_journal(context):
    assert list(context.project.storage.read_events()) == []


@step("the rejection identifies {string}")
def check_rejection(context, message):
    entry, = map(json.loads, context.project.read("rejected.jsonl").splitlines())
    assert entry["kind"] == "event", entry
    assert any(message in reason for reason in entry["errors"]), entry["errors"]


@step("the journal contains the newly recorded event")
def check_recorded_event(context):
    assert context.event["id"], context.event
    assert list(context.project.storage.read_events()) == [context.event]
