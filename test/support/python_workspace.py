"""Temporary workspace and native Python entry points for Behave scenarios."""

import ast
from dataclasses import dataclass
from importlib.machinery import BuiltinImporter, FrozenImporter, PathFinder
from importlib.util import resolve_name
import json
import os
from pathlib import Path
import subprocess
import sys
import sysconfig

from src.py.formats import parse_dot, parse_frontmatter
from src.py.spiral import COUNTER
from src.py.workspace import Workspace

ROOT = Path(__file__).resolve().parents[2]
PYTHON_SOURCE_ROOT = ROOT / "src" / "py"


@dataclass(frozen=True)
class RuntimeCommands:
    executable: str
    cli: Path
    hook: Path


PYTHON_COMMANDS = RuntimeCommands(
    sys.executable,
    ROOT / "bin" / "spiral.py",
    ROOT / "hooks" / "spiral-hook.py",
)


def external_imports():
    stdlib = Path(sysconfig.get_path("stdlib"))
    system_paths = [str(stdlib), str(stdlib / "lib-dynload"), str(Path(sys.base_prefix) / "DLLs")]
    violations = []
    source_root = PYTHON_SOURCE_ROOT.parent
    sources = [
        PYTHON_COMMANDS.cli,
        PYTHON_COMMANDS.hook,
        source_root / "__init__.py",
        *PYTHON_SOURCE_ROOT.rglob("*.py"),
    ]
    for source in sources:
        package = ""
        if source.is_relative_to(source_root):
            package = ".".join(source.parent.relative_to(ROOT).parts)
        for node in ast.walk(ast.parse(source.read_text(encoding="utf-8"))):
            if isinstance(node, ast.Import):
                names = [alias.name for alias in node.names]
            elif isinstance(node, ast.ImportFrom):
                names = [resolve_name("." * node.level + (node.module or ""), package)]
            else:
                continue
            for name in names:
                top = name.split(".")[0]
                if name == "src.py" or name.startswith("src.py."):
                    target = ROOT.joinpath(*name.split("."))
                    found = target.is_dir() or target.with_suffix(".py").is_file()
                else:
                    found = (
                        top in {"fcntl", "msvcrt"} or BuiltinImporter.find_spec(top)
                        or FrozenImporter.find_spec(top) or PathFinder.find_spec(top, system_paths)
                    )
                if not found:
                    violations.append(f"{source.relative_to(ROOT)}: {name}")
    return violations


class ScenarioWorkspace:
    def __init__(self, root):
        self.root = root
        self.directory = root / ".spiral"
        self.storage = Workspace(root)
        self.hook_env = {}
        self.runtime = PYTHON_COMMANDS

    def run(self, *args, executable=sys.executable, stdin=None, overrides=None):
        env = {
            **os.environ,
            "CLAUDE_PROJECT_DIR": "",
            "SPIRAL_ROOT": str(self.root),
            "SPIRAL_REFLECT_EVERY": "",
            "SPIRAL_DEBUG": "",
            "PYTHONIOENCODING": "utf-8",
            **(overrides or {}),
        }
        return subprocess.run(
            [executable, *args], cwd=self.root, env=env, input=stdin,
            encoding="utf-8", capture_output=True, timeout=10,
        )

    def cli(self, *args, runtime=None):
        commands = self.runtime if runtime is None else runtime
        return self.run(str(commands.cli), *args, executable=commands.executable)

    def hook(self, event, payload):
        stdin = payload if isinstance(payload, str) else json.dumps(payload)
        return self.run(
            str(self.runtime.hook), event, executable=self.runtime.executable,
            stdin=stdin, overrides=self.hook_env,
        )

    def file(self, *parts):
        return self.directory.joinpath(*parts)

    def write(self, parts, data):
        target = self.file(*parts)
        target.parent.mkdir(parents=True, exist_ok=True)
        with target.open("w", encoding="utf-8", newline="") as stream:
            stream.write(data)

    def read(self, *parts):
        with self.file(*parts).open(encoding="utf-8", newline="") as stream:
            return stream.read()

    def state(self, key=COUNTER):
        return parse_frontmatter(self.read("state", f"{key}.mdx"))

    def journal(self):
        return [json.loads(line) for line in self.read("journal.jsonl").split("\n") if line]

    def memory(self):
        relations, _ = parse_dot(self.read("memory.dot"))
        return relations
