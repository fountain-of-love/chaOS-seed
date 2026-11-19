import json
import os

from behave import step
from python_workspace import PYTHON_COMMANDS, ROOT, RuntimeCommands


RUNTIMES = {
    "node": RuntimeCommands(
        os.environ.get("NODE") or "node",
        ROOT / "bin" / "spiral.mjs",
        ROOT / "hooks" / "spiral-hook.mjs",
    ),
    "python": PYTHON_COMMANDS,
}


@step("I use {string}")
def select_runtime(context, name):
    assert name in RUNTIMES, f"Unknown test runtime: {name}"
    context.project.runtime = RUNTIMES[name]


@step("I save the hook context")
def save_hook_context(context):
    context.saved_hook_context = context.agent_context


@step("the hook context matches the saved context")
def check_hook_context(context):
    assert context.agent_context == context.saved_hook_context, context.agent_context


@step("I remember this relation citing prompts {int} through {int}:")
def remember_citing_prompts(context, first, last):
    prompts = [event for event in context.project.journal() if event["type"] == "prompt"]
    evidence = [event["id"] for event in prompts[first - 1:last]]
    assert len(evidence) == last - first + 1, evidence
    result = context.project.cli("remember", *json.loads(context.text), "--evidence", ",".join(evidence))
    assert result.returncode == 0, result.stderr


@step("both runtimes agree on these commands:")
def compare_command_output(context):
    for row in context.table:
        command = row["command"]
        node = context.project.cli(command, runtime=RUNTIMES["node"])
        python = context.project.cli(command, runtime=RUNTIMES["python"])
        assert node.returncode == 0, node.stderr
        assert python.returncode == 0, python.stderr
        assert node.stdout == python.stdout, (command, node.stdout, python.stdout)
