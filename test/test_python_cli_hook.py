from concurrent.futures import ThreadPoolExecutor
import json
import os
from pathlib import Path
import subprocess
import sys
from tempfile import TemporaryDirectory
import unittest

REPO = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(REPO / "python"))

from chaos_seed.formats import parse_dot, parse_frontmatter, render_frontmatter


CLI = REPO / "python" / "spiral.py"
HOOK = REPO / "python" / "spiral_hook.py"
COUNTER = "promptsSinceReflection"


class WorkspaceTestCase(unittest.TestCase):
    def setUp(self):
        temporary = TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.root = Path(temporary.name)
        self.directory = self.root / ".spiral"
        self.env = {**os.environ, "CLAUDE_PROJECT_DIR": str(self.root), "PYTHONIOENCODING": "utf-8"}
        for name in ("SPIRAL_REFLECT_EVERY", "SPIRAL_DEBUG"):
            self.env.pop(name, None)

    def run_script(self, script, *args, payload=None, **env):
        return subprocess.run(
            [sys.executable, str(script), *args],
            cwd=self.root,
            env={**self.env, **env},
            input=payload,
            encoding="utf-8",
            capture_output=True,
            timeout=10,
        )

    def journal(self):
        return [json.loads(line) for line in (self.directory / "journal.jsonl").read_text(encoding="utf-8").splitlines()]

    def state_path(self, key):
        return self.directory / "state" / f"{key}.mdx"

    def state(self, key):
        return parse_frontmatter(self.state_path(key).read_text(encoding="utf-8"))


class CliTests(WorkspaceTestCase):
    def setUp(self):
        super().setUp()
        self.state_path(COUNTER).parent.mkdir(parents=True)
        events = [
            {"id": f"e-{index}", "at": f"2000-01-18T09:0{index}:00.000Z", "type": "prompt",
             "actor": {"role": "person"}, "data": {"text": text}}
            for index, text in enumerate(("run the tests", "Run the tests", "ship it"))
        ]
        (self.directory / "journal.jsonl").write_text(
            "".join(f"{json.dumps(event)}\n" for event in events), encoding="utf-8"
        )
        meta = {"key": COUNTER, "value": 3, "at": events[-1]["at"], "cause": "e-2", "version": 3}
        self.state_path(COUNTER).write_text(render_frontmatter(meta), encoding="utf-8")
        self.memory_path = self.directory / "memory.dot"

    def spiral(self, *args):
        return self.run_script(CLI, *args)

    def test_review_reports_evidence_for_repetitions(self):
        """review shows prompts and repeats, with the events"""
        result = self.spiral("review")
        self.assertEqual(result.returncode, 0)
        self.assertIn("3 prompts", result.stdout)
        self.assertIn("2× run the tests (e-0 e-1)", result.stdout)

    def test_reflect_prompts_for_relations(self):
        """reflect asks for relations"""
        result = self.spiral("reflect")
        self.assertEqual(result.returncode, 0)
        for text in ("run the tests", "spiral remember", "spiral reflected"):
            self.assertIn(text, result.stdout)

    def test_reflected_resets_counter_and_records_time(self):
        """reflected is an event that sets the counter to 0 and registers the moment"""
        self.assertEqual(self.spiral("reflected").returncode, 0)
        counter, _ = self.state(COUNTER)
        moment, _ = self.state("lastReflectionAt")
        event = self.journal()[-1]
        self.assertEqual(event["type"], "reflection")
        self.assertEqual(counter["value"], 0)
        self.assertEqual(counter["version"], 4)
        self.assertEqual(counter["cause"], moment["cause"])
        self.assertEqual(moment["cause"], event["id"])
        self.assertEqual(moment["value"], event["at"])
        self.assertIn("0 prompts", self.spiral("review").stdout)

    def test_remember_adds_cited_and_generated_evidence(self):
        """remember increments a relation with evidence, and memory reads it back"""
        args = ("remember", "ship it", "follows", "run the tests")
        self.assertEqual(self.spiral(*args, "--evidence", "e-0,e-1").returncode, 0)
        self.assertEqual(self.spiral(*args).returncode, 0)
        (relation,), _ = parse_dot(self.memory_path.read_text(encoding="utf-8"))
        self.assertEqual(relation["weight"], 3)
        self.assertEqual(len(relation["evidence"]), 3)
        self.assertRegex(self.spiral("memory").stdout, r"3\s+ship it → follows → run the tests \(dance\)")

    def test_remember_refuses_invalid_relations(self):
        """remember refuses a relation that breaks the contract, before writing anything"""
        result = self.spiral("remember", "a", "Not A Type", "b")
        self.assertEqual(result.returncode, 1)
        self.assertIn("type", result.stderr)
        self.assertNotIn("remember", [event["type"] for event in self.journal()])
        self.assertFalse(self.memory_path.exists())

    def test_status_reports_counter_and_trigger(self):
        """status reports the counter and the trigger"""
        self.assertIn("3 of 14 prompts", self.spiral("status").stdout)

    def test_unsafe_dot_writes_preserve_memory(self):
        """unsafe DOT writes preserve existing memory"""
        self.assertEqual(self.spiral("remember", "a", "follows", "b").returncode, 0)
        before = self.memory_path.read_bytes()
        journal = self.journal()
        result = self.spiral("remember", "one\ntwo", "follows", "b")
        self.assertEqual(result.returncode, 1)
        self.assertIn("single-line", result.stderr)
        self.assertEqual(self.memory_path.read_bytes(), before)
        self.assertEqual(self.journal(), journal)

        damaged = before.replace(b"}\n", b"  c -> d;\n}\n")
        self.memory_path.write_bytes(damaged)
        result = self.spiral("remember", "c", "follows", "d")
        self.assertEqual(result.returncode, 1)
        self.assertIn("unreadable relations", result.stderr)
        self.assertEqual(self.memory_path.read_bytes(), damaged)
        self.assertEqual(self.journal(), journal)

    def test_parallel_remember_keeps_all_evidence(self):
        """parallel remember commands keep all relation evidence"""
        args = ("remember", "ship it", "follows", "run the tests")
        with ThreadPoolExecutor(max_workers=8) as pool:
            results = list(pool.map(lambda index: self.spiral(*args, "--evidence", f"e-{index}"), range(8)))
        self.assertEqual([result.returncode for result in results], [0] * 8)
        (relation,), _ = parse_dot(self.memory_path.read_text(encoding="utf-8"))
        self.assertEqual(relation["weight"], 8)
        self.assertCountEqual(relation["evidence"], [f"e-{index}" for index in range(8)])


class HookTests(WorkspaceTestCase):
    def hook(self, event, payload, **env):
        data = payload if isinstance(payload, str) else json.dumps(payload)
        return self.run_script(HOOK, event, payload=data, **env)

    def test_prompt_is_journaled_and_returns_context(self):
        """observe: a prompt becomes an event, and the spiral is applied as context"""
        result = self.hook("UserPromptSubmit", {"session_id": "s1", "prompt": "Tidy the README"})
        self.assertEqual(result.returncode, 0)
        output = json.loads(result.stdout)["hookSpecificOutput"]
        self.assertEqual(output["hookEventName"], "UserPromptSubmit")
        self.assertIn("intent", output["additionalContext"].lower())
        event, = self.journal()
        self.assertEqual(event["type"], "prompt")
        self.assertEqual(event["actor"], {"role": "person", "session": "s1"})
        self.assertEqual(event["data"]["text"], "Tidy the README")

    def test_counter_is_stored_as_versioned_mdx(self):
        """apply: the counter persists as an MDX state, caused by the event, with a 5W2H body"""
        for text in ("one", "two"):
            self.assertEqual(self.hook("UserPromptSubmit", {"prompt": text}).returncode, 0)
        meta, body = self.state(COUNTER)
        self.assertEqual(meta["value"], 2)
        self.assertEqual(meta["version"], 2)
        self.assertEqual(meta["cause"], self.journal()[1]["id"])
        for heading in ("What", "Why", "Who", "Where", "When", "How", "How much"):
            self.assertIn(f"## {heading}", body.splitlines())

    def test_state_body_and_extra_fields_are_preserved(self):
        """apply: updating state preserves the body and custom metadata"""
        self.hook("UserPromptSubmit", {"prompt": "one"})
        meta, body = self.state(COUNTER)
        edited_body = body + "\nMy own words.\n"
        self.state_path(COUNTER).write_text(render_frontmatter({**meta, "owner": "team"}, edited_body), encoding="utf-8")
        self.hook("UserPromptSubmit", {"prompt": "two"})
        updated, body = self.state(COUNTER)
        self.assertEqual(updated["value"], 2)
        self.assertEqual(updated["owner"], "team")
        self.assertEqual(body, edited_body)

    def test_due_context_repeats_learned_relations(self):
        """learn: the volume trigger fires and relations that held come back"""
        self.directory.mkdir()
        (self.directory / "memory.dot").write_text(
            'digraph memory {\n  "person" -> "small steps" [type="prefers", weight=4, evidence="e-1 e-2 e-3 e-4"];\n}\n',
            encoding="utf-8",
        )
        for index in range(3):
            result = self.hook("UserPromptSubmit", {"prompt": f"p{index}"}, SPIRAL_REFLECT_EVERY="3")
        context = json.loads(result.stdout)["hookSpecificOutput"]["additionalContext"]
        self.assertIn("Reflection is due", context)
        self.assertIn("person → prefers → small steps (4, noticed)", context)

    def test_stop_journals_reply_intent(self):
        """apply: the reply's stated intent is kept with the reply"""
        result = self.hook("Stop", {"session_id": "s1", "last_assistant_message": "intent: tidy the README\n\nDone."})
        self.assertEqual(result.returncode, 0)
        event, = self.journal()
        self.assertEqual(event["type"], "reply")
        self.assertEqual(event["actor"], {"role": "agent", "session": "s1"})
        self.assertEqual(event["data"]["intent"], "tidy the README")

    def test_bad_input_fails_open(self):
        """the hook fails open on bad input"""
        result = self.hook("UserPromptSubmit", "not json")
        self.assertEqual((result.returncode, result.stdout, result.stderr), (0, "", ""))
        self.assertFalse(self.directory.exists())
        debug = self.hook("UserPromptSubmit", "not json", SPIRAL_DEBUG="1")
        self.assertEqual((debug.returncode, debug.stdout), (0, ""))
        self.assertIn("spiral-hook:", debug.stderr)

    def test_parallel_prompts_keep_counter_in_sync(self):
        """parallel prompt hooks keep the counter in sync"""
        def submit(index):
            return self.hook("UserPromptSubmit", {"prompt": f"prompt {index}"})

        with ThreadPoolExecutor(max_workers=8) as pool:
            results = list(pool.map(submit, range(8)))
            results.extend(pool.map(submit, range(8, 16)))
        self.assertEqual([result.returncode for result in results], [0] * 16)
        self.assertEqual(len(self.journal()), 16)
        self.assertEqual(self.state(COUNTER)[0]["value"], 16)
        self.assertEqual(sum("Reflection is due" in result.stdout for result in results), 1)
