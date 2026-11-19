from concurrent.futures import ThreadPoolExecutor
import json

from behave import step
from src.py.formats import render_frontmatter
from src.py.spiral import COUNTER


def hook_response(result):
    assert result.returncode == 0, result.stderr
    return json.loads(result.stdout)["hookSpecificOutput"]


def submit_prompt(context, prompt, session=None):
    context.result = context.project.hook("UserPromptSubmit", {"prompt": prompt, "session_id": session})
    context.response = hook_response(context.result)
    context.agent_context = context.response["additionalContext"]


@step("session {string} submits the prompt {string}")
def submit_as_session(context, session, prompt):
    submit_prompt(context, prompt, session)


@step("I submit {string}")
def submit(context, prompt):
    submit_prompt(context, prompt)


@step("the hook response is for {string}")
def check_hook_event(context, event):
    assert context.response["hookEventName"] == event, context.response


@step("the last journal entry has these fields:")
def check_latest_journal_entry(context):
    expected = json.loads(context.text)
    entry = context.project.journal()[-1]
    assert {key: entry[key] for key in expected} == expected, entry


@step("the last prompt caused the counter update")
def check_prompt_cause(context):
    meta, _ = context.project.state()
    assert meta["cause"] == context.project.journal()[-1]["id"], meta


@step("the state body includes these headings:")
def check_state_headings(context):
    _, body = context.project.state()
    lines = body.split("\n")
    for row in context.table:
        assert f"## {row['heading']}" in lines, body


@step("I set state metadata {string} to {string} and append this note:")
def edit_state(context, key, value):
    meta, body = context.project.state()
    updated_body = f"{body}\n{context.text}\n"
    context.edited_state = (key, value, updated_body)
    state = render_frontmatter({**meta, key: value}, updated_body)
    context.project.write(("state", f"{COUNTER}.mdx"), state)


@step("the edited state body and extra metadata are unchanged")
def check_edited_state(context):
    key, value, expected_body = context.edited_state
    meta, body = context.project.state()
    assert meta[key] == value, meta
    assert body == expected_body, body


@step("reflection is due every {int} prompts")
def configure_reflection_interval(context, interval):
    context.project.hook_env["SPIRAL_REFLECT_EVERY"] = str(interval)


@step("this memory graph is stored:")
def seed_memory(context):
    context.project.write(("memory.dot",), context.text + "\n")


@step("session {string} ends with this reply:")
def end_session(context, session):
    context.result = context.project.hook("Stop", {"session_id": session, "last_assistant_message": context.text})


@step("hook debugging is enabled")
def enable_hook_debugging(context):
    context.project.hook_env["SPIRAL_DEBUG"] = "1"


@step("the prompt hook receives raw input {string}")
def send_raw_input(context, text):
    context.result = context.project.hook("UserPromptSubmit", text)


@step("the workspace has no spiral files")
def check_no_spiral_files(context):
    assert not context.project.directory.exists()


@step("{int} prompts are submitted concurrently")
def submit_concurrently(context, count):
    project = context.project
    batch_size = 8

    def submit_index(index):
        return hook_response(project.hook("UserPromptSubmit", {"prompt": f"prompt {index}"}))["additionalContext"]

    context.hook_responses = []
    with ThreadPoolExecutor(max_workers=batch_size) as workers:
        for start in range(0, count, batch_size):
            context.hook_responses.extend(workers.map(submit_index, range(start, min(count, start + batch_size))))


@step("the journal contains {int} events")
def check_journal_size(context, count):
    assert len(context.project.journal()) == count


@step("exactly {int} hook response(s) mentions {string}")
def count_matching_responses(context, count, part):
    assert sum(part in response for response in context.hook_responses) == count
