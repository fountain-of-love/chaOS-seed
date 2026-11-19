import ast
from importlib.machinery import BuiltinImporter, FrozenImporter, PathFinder
from importlib.util import resolve_name
import json
from pathlib import Path
import re
import subprocess
import sys
import sysconfig
from tempfile import TemporaryDirectory
import unittest


ROOT = Path(__file__).resolve().parents[1]
PYTHON_ROOT = ROOT / "python"
sys.path.insert(0, str(PYTHON_ROOT))

from chaos_seed.contract import (
    EVENT_FIELDS, RELATION_FIELDS, STATE_FIELDS, validate_event, validate_relation, validate_state,
)
from chaos_seed.formats import parse_dot, parse_frontmatter, render_dot, render_frontmatter
from chaos_seed.growth import is_variation_check, ladder_stage
from chaos_seed.spiral import build_context, is_reflection_due, review_journal, stated_intent, strengthen
from chaos_seed.workspace import Workspace


EVENT = {
    "id": "e-1a2b-c3d4",
    "at": "2026-11-19T09:00:00.000Z",
    "type": "prompt",
    "actor": {"role": "person", "session": "s1"},
    "data": {"text": "hi"},
}
STATE = {"key": "promptsSinceReflection", "value": 3, "at": EVENT["at"], "cause": EVENT["id"], "version": 1}
RELATION = {"from": "ship it", "type": "follows", "to": "run the tests", "weight": 2, "evidence": ["e-1", "e-2"]}


class BoundaryTests(unittest.TestCase):
    def test_standard_library_only(self):
        """the seed imports nothing outside itself and only standard library modules"""
        stdlib = Path(sysconfig.get_path("stdlib"))
        system_paths = [str(stdlib), str(stdlib / "lib-dynload"), str(Path(sys.base_prefix) / "DLLs")]
        for source in PYTHON_ROOT.rglob("*.py"):
            package = ".".join(source.parent.relative_to(PYTHON_ROOT).parts)
            for node in ast.walk(ast.parse(source.read_text(encoding="utf-8"))):
                if isinstance(node, ast.Import):
                    names = [alias.name for alias in node.names]
                elif isinstance(node, ast.ImportFrom):
                    names = [resolve_name("." * node.level + (node.module or ""), package)]
                else:
                    continue
                for name in names:
                    top = name.split(".")[0]
                    if top == "chaos_seed":
                        target = PYTHON_ROOT.joinpath(*name.split("."))
                        self.assertTrue(target.is_dir() or target.with_suffix(".py").is_file(), f"{source}: {name}")
                    elif top not in {"fcntl", "msvcrt"}:
                        found = (
                            BuiltinImporter.find_spec(top) or FrozenImporter.find_spec(top)
                            or PathFinder.find_spec(top, system_paths)
                        )
                        self.assertIsNotNone(found, f"{source} imports an external module: {name}")


class ContractTests(unittest.TestCase):
    def test_matches_contract_document(self):
        """each record type has required elements, as CONTRACT.md says"""
        lines = (ROOT / "CONTRACT.md").read_text(encoding="utf-8").splitlines()
        for fields, record in ((EVENT_FIELDS, "event"), (STATE_FIELDS, "state"), (RELATION_FIELDS, "relation")):
            with self.subTest(record=record):
                row = next(line for line in lines if f"| {record}:" in line)
                documented = re.findall(r"`([^`]+)`", row.split("|")[-2])
                self.assertEqual(len(fields), 5)
                self.assertEqual(documented, list(fields))

    def test_valid_records_allow_unknown_fields(self):
        """valid records pass, and unknown fields are allowed"""
        self.assertEqual(validate_event({**EVENT, "mood": "calm"}), [])
        self.assertEqual(validate_state(STATE), [])
        self.assertEqual(validate_relation({**RELATION, "extra": {"colour": "red"}}), [])

    def test_invalid_records_explain_why(self):
        """invalid records say what is wrong"""
        self.assertRegex(" ".join(validate_event({**EVENT, "actor": {"role": "robot"}})), r"actor\.role")
        self.assertIn("missing id", validate_event({"at": EVENT["at"]}))
        self.assertRegex(" ".join(validate_state({**STATE, "key": "../escape"})), "key")
        self.assertRegex(" ".join(validate_state({**STATE, "version": 0})), "version")
        self.assertRegex(" ".join(validate_relation({**RELATION, "weight": float("nan")})), "weight")
        self.assertRegex(" ".join(validate_relation({**RELATION, "evidence": "e-1"})), "evidence")


class FormatTests(unittest.TestCase):
    def test_mdx_round_trip(self):
        """MDX frontmatter round-trips and leaves the body untouched"""
        body = "\n## What\nThe counter.\n"
        meta = {"key": "count", "value": 3, "at": EVENT["at"], "cause": "e-1", "version": 2}
        text = render_frontmatter(meta, body)
        self.assertTrue(text.startswith('---\nkey: "count"\nvalue: 3\n'))
        self.assertEqual(parse_frontmatter(text), (meta, body))

    def test_read_handwritten_frontmatter(self):
        """frontmatter written by hand in plain YAML is read too"""
        meta, _ = parse_frontmatter("---\nkey: mood\nvalue: calm\nversion: 1\nat: null\n---\nfree text\n")
        self.assertEqual(meta, {"key": "mood", "value": "calm", "version": 1, "at": None})

    def test_dot_round_trip(self):
        """DOT relations round-trip as weighted directed vectors, quotes included"""
        relations = [
            {**RELATION, "from": 'say "ship it"', "to": r"run the \tests"},
            {"from": "person", "type": "prefers", "to": "small steps", "weight": 5, "evidence": ["e-3"],
             "extra": {"colour": "red"}},
        ]
        text = render_dot(relations)
        self.assertTrue(text.startswith("digraph memory {\n"))
        self.assertIn('"person" -> "small steps" [type="prefers", weight=5', text)
        self.assertEqual(parse_dot(text), (relations, []))

    def test_unreadable_edges_are_reported(self):
        """an edge line that cannot be read is reported, not guessed"""
        self.assertEqual(parse_dot("digraph memory {\n  a -> b;\n}\n"), ([], ["a -> b;"]))


class GrowthTests(unittest.TestCase):
    def test_weight_stages(self):
        """weights read on the stages of growth"""
        self.assertEqual(
            [ladder_stage(weight) for weight in (1, 2, 5, 10, 25, 26)],
            ["none", "dance", "noticed", "routine", "governed", "re-seed"],
        )

    def test_variation_counts(self):
        """variation checks come at their own counts"""
        self.assertEqual([count for count in range(50) if is_variation_check(count)], [2, 6, 8, 14, 22, 36])


class SpiralTests(unittest.TestCase):
    def test_context_replays_noticed_relations(self):
        """the context carries the spiral and only relations that reached noticed"""
        relations = [{**RELATION, "weight": 4}, {**RELATION, "from": "once", "to": "only", "weight": 3}]
        context = build_context(relations, prompts_since_reflection=1, reflect_every=10)
        self.assertIn("intent", context.lower())
        self.assertIn("ship it → follows → run the tests (4, noticed)", context)
        self.assertNotIn("once", context)
        self.assertNotRegex(context, "Reflection is due|Variation check")

    def test_reflection_interval(self):
        """reflection is due every N prompts"""
        self.assertFalse(is_reflection_due(9, 10))
        self.assertTrue(is_reflection_due(10, 10))
        self.assertFalse(is_reflection_due(0, 10))
        self.assertIn("Reflection is due", build_context(prompts_since_reflection=10, reflect_every=10))

    def test_variation_context(self):
        """a variation check comes at its counts and not at others"""
        self.assertIn("Variation check", build_context(prompts_since_reflection=6, reflect_every=10))
        self.assertNotIn("Variation check", build_context(prompts_since_reflection=7, reflect_every=10))

    def test_opening_intent_line(self):
        """only the opening intent line of a reply counts"""
        self.assertEqual(stated_intent("intent: tidy the README\n\nDone."), "tidy the README")
        self.assertIsNone(stated_intent("Done.\nintent: quoted later"))
        self.assertIsNone(stated_intent(""))

    def test_strengthen_counts_distinct_evidence_without_mutating_input(self):
        """weight counts the distinct events that support a relation, without mutating the original"""
        ab = {"from": "a", "type": "follows", "to": "b"}
        before = [{**ab, "weight": 1, "evidence": ["e-1"]}]
        after = strengthen(before, ab, ["e-2", "e-2", "e-1"])
        after = strengthen(after, {"from": "c", "type": "follows", "to": "d"}, ["e-3", "e-4"])
        self.assertEqual(before, [{**ab, "weight": 1, "evidence": ["e-1"]}])
        self.assertEqual(
            [(item["weight"], item["evidence"]) for item in after],
            [(2, ["e-1", "e-2"]), (2, ["e-3", "e-4"])],
        )

    def test_review_counts_daily_prompts_and_repetitions(self):
        """the review counts prompts per day and verbatim repeats, with their events"""
        def prompt(event_id, at, text):
            return {**EVENT, "id": event_id, "at": at, "data": {"text": text}}

        events = [
            prompt("e-0", "2026-11-17T09:00:00.000Z", "old"),
            prompt("e-1", "2026-11-18T09:00:00.000Z", "Run the tests"),
            {**prompt("e-2", "2026-11-18T10:00:00.000Z", "ok"), "type": "reply", "actor": {"role": "agent"}},
            prompt("e-3", "2026-11-19T09:00:00.000Z", "run the tests "),
            prompt("e-4", "2026-11-19T09:05:00.000Z", "something new"),
        ]
        self.assertEqual(review_journal(events, "2026-11-18T00:00:00.000Z"), {
            "prompts": 3,
            "byDay": {"2026-11-18": 1, "2026-11-19": 2},
            "repeats": [{"text": "run the tests", "count": 2, "evidence": ["e-1", "e-3"]}],
        })


class WorkspaceTests(unittest.TestCase):
    def test_refused_event_is_logged_separately(self):
        """an event the contract refuses is not journaled, and the refusal is kept"""
        with TemporaryDirectory() as root:
            workspace = Workspace(root)
            self.assertIsNone(workspace.append_event("prompt", "robot", {"text": "hi"}))
            self.assertEqual(list(workspace.read_events()), [])
            text = (workspace.directory / "rejected.jsonl").read_text(encoding="utf-8")
            rejected, = map(json.loads, text.splitlines())
            self.assertEqual(rejected["kind"], "event")
            self.assertRegex(" ".join(rejected["errors"]), r"actor\.role")

    def test_writer_recovers_after_lock_owner_exits(self):
        """a workspace accepts writes after its lock owner exits unexpectedly"""
        with TemporaryDirectory() as root:
            script = (
                "import os, sys\n"
                "sys.path.insert(0, sys.argv[1])\n"
                "from chaos_seed.workspace import Workspace\n"
                "with Workspace(os.getcwd()).mutation():\n"
                "    os._exit(0)\n"
            )
            subprocess.run([sys.executable, "-c", script, str(PYTHON_ROOT)], cwd=root, check=True, timeout=10)
            workspace = Workspace(root)
            with workspace.mutation():
                event = workspace.append_event("prompt", "person", {"text": "hi"})
            self.assertEqual(list(workspace.read_events()), [event])
