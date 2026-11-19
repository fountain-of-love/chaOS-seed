import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
from tempfile import TemporaryDirectory
import unittest


REPO = Path(__file__).resolve().parents[1]
PYTHON_CLI = (sys.executable, str(REPO / "python" / "spiral.py"))
PYTHON_HOOK = (sys.executable, str(REPO / "python" / "spiral_hook.py"))
NODE = shutil.which("node")


class RuntimeInteroperabilityTests(unittest.TestCase):
    def setUp(self):
        temporary = TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.root = Path(temporary.name)
        self.directory = self.root / ".spiral"
        self.env = os.environ.copy()
        for name in ("CLAUDE_PROJECT_DIR", "SPIRAL_REFLECT_EVERY", "SPIRAL_DEBUG"):
            self.env.pop(name, None)
        self.env.update(SPIRAL_ROOT=str(self.root), PYTHONIOENCODING="utf-8")

    def run_script(self, script, *args, payload=None, env=None, check=True):
        return subprocess.run(
            [*script, *args],
            cwd=self.root,
            env={**self.env, **(env or {})},
            input=payload,
            encoding="utf-8",
            capture_output=True,
            timeout=10,
            check=check,
        )

    def prompt(self, script, text, **env):
        payload = json.dumps({"session_id": "s1", "prompt": text})
        result = self.run_script(script, "UserPromptSubmit", payload=payload, env=env)
        return json.loads(result.stdout)["hookSpecificOutput"]["additionalContext"]

    def journal(self):
        return [
            json.loads(line)
            for line in (self.directory / "journal.jsonl").read_text(encoding="utf-8").splitlines()
        ]

    @unittest.skipUnless(NODE, "Node is needed for the interoperability check")
    def test_node_and_python_can_alternate_in_one_workspace(self):
        node_cli = (NODE, str(REPO / "bin" / "spiral.mjs"))
        node_hook = (NODE, str(REPO / "hooks" / "spiral-hook.mjs"))
        self.prompt(node_hook, "Relire les tests")
        node_context = self.prompt(node_hook, "Relire les tests", SPIRAL_REFLECT_EVERY="2")
        self.run_script(node_cli, "reflected")
        state = self.directory / "state" / "promptsSinceReflection.mdx"
        original = state.read_text(encoding="utf-8")
        header, body = original[4:].split("\n---\n", 1)
        edited_body = body + "\nNotes de réflexion.\n"
        state.write_text(f'---\n{header}\nowner: "team"\n---\n{edited_body}', encoding="utf-8")
        self.prompt(PYTHON_HOOK, "Relire les tests")
        python_context = self.prompt(PYTHON_HOOK, "Relire les tests", SPIRAL_REFLECT_EVERY="2")
        self.assertEqual(python_context, node_context)
        updated_state = state.read_text(encoding="utf-8")
        self.assertIn('owner: "team"', updated_state)
        self.assertTrue(updated_state.endswith(edited_body))
        self.run_script(
            PYTHON_HOOK, "Stop", payload=json.dumps({
                "session_id": "s1",
                "last_assistant_message": "intent: relire les tests\n\nFini.",
            }),
        )
        events = self.journal()
        self.assertEqual(events[-1]["actor"], {"session": "s1", "role": "agent"})
        self.assertEqual(events[-1]["data"]["intent"], "relire les tests")
        ids = [event["id"] for event in events if event["type"] == "prompt"]
        relation = ('terminer "ça"', "follows", r"relire \tests")
        self.run_script(node_cli, "remember", *relation, "--evidence", ",".join(ids[:2]))
        self.run_script(PYTHON_CLI, "remember", *relation, "--evidence", ",".join(ids[1:]))
        for command in ("status", "review", "reflect", "memory"):
            with self.subTest(command=command):
                self.assertEqual(
                    self.run_script(node_cli, command).stdout,
                    self.run_script(PYTHON_CLI, command).stdout,
                )
        self.assertIn("4  terminer", self.run_script(node_cli, "memory").stdout)
        self.assertIn("4, noticed", self.prompt(node_hook, "Apply learned memory"))
        self.run_script(PYTHON_CLI, "reflected")
        self.assertIn("0 of 14 prompts", self.run_script(node_cli, "status").stdout)


if __name__ == "__main__":
    unittest.main()
