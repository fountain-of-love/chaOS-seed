"""Read an agent hook payload on stdin and emit its JSON response."""

import os
import sys

from chaos_seed.formats import dump_json, load_json
from chaos_seed.spiral import COUNTER, DEFAULT_REFLECT_EVERY, build_context, stated_intent
from chaos_seed.workspace import Workspace, reflect_every, workspace_root


def on_prompt(workspace, payload, every):
    text = payload.get("prompt") or ""
    with workspace.mutation():
        event = workspace.append_event("prompt", "person", {"text": text}, payload.get("session_id"))
        if event is None:
            raise ValueError("The prompt event was refused; see .spiral/rejected.jsonl.")
        count = workspace.state_value(COUNTER, 0) + 1
        errors = workspace.write_state(COUNTER, count, event["id"])
        if errors:
            raise ValueError(f"Unable to update {COUNTER}: {'; '.join(errors)}")
        context = build_context(workspace.read_relations(), count, every)
    return {"hookSpecificOutput": {"hookEventName": "UserPromptSubmit", "additionalContext": context}}


def on_stop(workspace, payload, _every):
    text = payload.get("last_assistant_message") or ""
    data = {"intent": stated_intent(text), "text": text}
    with workspace.mutation():
        workspace.append_event("reply", "agent", data, payload.get("session_id"))


HANDLERS = {"UserPromptSubmit": on_prompt, "Stop": on_stop}


def main(argv=None):
    args = sys.argv[1:] if argv is None else argv
    try:
        handler = HANDLERS.get(args[0]) if args else None
        if handler:
            payload = load_json(sys.stdin.read())
            output = handler(Workspace(workspace_root()), payload, reflect_every(DEFAULT_REFLECT_EVERY))
            if output:
                sys.stdout.write(dump_json(output))
    except Exception as error:
        if os.environ.get("SPIRAL_DEBUG"):
            print(f"spiral-hook: {error}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())
