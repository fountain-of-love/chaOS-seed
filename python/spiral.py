"""Run the chaOS seed command-line interface."""

import sys

from chaos_seed.contract import validate_relation
from chaos_seed.growth import NOTICED_WEIGHT, ladder_stage
from chaos_seed.spiral import COUNTER, DEFAULT_REFLECT_EVERY, MOMENT, describe_relation, review_journal, strengthen
from chaos_seed.workspace import InvalidMemoryError, Workspace, reflect_every, workspace_root


class UsageError(ValueError):
    """A command could not be completed."""


def status(workspace, _args):
    count = workspace.state_value(COUNTER, 0)
    moment = workspace.state_value(MOMENT, "never")
    every = reflect_every(DEFAULT_REFLECT_EVERY)
    return f"{count} of {every} prompts before reflection is due. Last reflection: {moment}."


def review(workspace, _args):
    since = workspace.state_value(MOMENT, None)
    summary = review_journal(workspace.read_events(), since)
    period = f"since {since}" if since else "since the start"
    lines = [f'{summary["prompts"]} prompts {period}.']
    lines.extend(f"  {day}: {count}" for day, count in summary["byDay"].items())
    if summary["repeats"]:
        lines.append("Repeated verbatim:")
        for repeat in summary["repeats"]:
            evidence = " ".join(repeat["evidence"])
            lines.append(f'  {repeat["count"]}× {repeat["text"]} ({evidence})')
    return "\n".join(lines)


def reflect(workspace, args):
    return "\n".join([
        "Reflect on the work since the last reflection.",
        "",
        review(workspace, args),
        "",
        f"Read the journal ({workspace.journal_path}) where the review is not enough.",
        "Ask: what did the person have to repeat? What did I misread (compare each reply's intent with its prompt)? "
        "What should I do without being asked next time?",
        "Ask about variation too: what varied, and is that variation emergence to keep or drift to correct?",
        "Record each finding as a directed relation, with the events that support it:",
        '  spiral remember "<from>" <verb> "<to>" --evidence e-…,e-…',
        "Use a lowercase verb such as follows, prefers, means or avoids. "
        "A relation weighs as many distinct events as support it.",
        f"Repetition is evidence, not a verdict: only relations with weight {NOTICED_WEIGHT} or more "
        "are given back as lessons.",
        "Then run `spiral reflected`.",
    ])


def reflected(workspace, _args):
    with workspace.mutation():
        event = workspace.append_event("reflection", "tool", {})
        if event is None:
            raise UsageError("The reflection event was refused; see .spiral/rejected.jsonl.")
        for key, value in ((COUNTER, 0), (MOMENT, event["at"])):
            errors = workspace.write_state(key, value, event["id"])
            if errors:
                raise UsageError(f"Unable to update {key}: {'; '.join(errors)}")
    return "Reflection marked. The counter starts again."


def memory(workspace, _args):
    relations = sorted(workspace.read_relations(), key=lambda relation: relation["weight"], reverse=True)
    if not relations:
        return "Nothing learned yet."
    return "\n".join(
        f'{str(relation["weight"]):>3}  {describe_relation(relation)} ({ladder_stage(relation["weight"])})'
        for relation in relations
    )


def remember(workspace, args):
    usage = "Use: spiral remember <from> <type> <to> [--evidence e-1,e-2]"
    if len(args) < 3 or not all(args[:3]):
        raise UsageError(usage)
    relation = dict(zip(("from", "type", "to"), args[:3]))
    errors = validate_relation({**relation, "weight": 1, "evidence": []})
    if errors:
        raise UsageError(f"Refused by the contract: {'; '.join(errors)}")
    options = args[3:]
    evidence = []
    if options:
        if len(options) != 2 or options[0] != "--evidence" or not options[1]:
            raise UsageError(usage)
        evidence = [item for item in options[1].split(",") if item]
        if not evidence:
            raise UsageError(usage)

    with workspace.mutation():
        relations = workspace.read_relations(strict=True)
        if not evidence:
            event = workspace.append_event("remember", "tool", relation)
            if event is None:
                raise UsageError("The remember event was refused; see .spiral/rejected.jsonl.")
            evidence = [event["id"]]
        updated = strengthen(relations, relation, evidence)
        errors = workspace.write_relations(updated)
        if errors:
            raise UsageError(f"Refused by the contract: {'; '.join(errors)}")

    saved = next(candidate for candidate in updated if all(candidate[key] == value for key, value in relation.items()))
    return f'{describe_relation(saved)}: weight {saved["weight"]} ({ladder_stage(saved["weight"])}).'


COMMANDS = {
    "status": status,
    "review": review,
    "reflect": reflect,
    "reflected": reflected,
    "memory": memory,
    "remember": remember,
}


def main(argv=None):
    args = sys.argv[1:] if argv is None else argv
    name, *options = args or ["status"]
    command = COMMANDS.get(name)
    if command is None:
        print(f"Unknown command. Use: {' | '.join(COMMANDS)}", file=sys.stderr)
        return 1
    try:
        print(command(Workspace(workspace_root()), options))
    except (UsageError, InvalidMemoryError, OSError) as error:
        print(error, file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
