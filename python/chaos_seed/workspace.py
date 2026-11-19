"""Filesystem adapter for the shared .spiral workspace."""

from contextlib import contextmanager
from datetime import datetime, timezone
import os
from pathlib import Path
import re
from secrets import token_hex
from tempfile import NamedTemporaryFile

from .contract import STATE_KEY, validate_event, validate_relation, validate_state
from .formats import dump_json, load_json, parse_dot, parse_frontmatter, render_dot, render_frontmatter


STATE_TEMPLATE = Path(__file__).resolve().parents[2] / "templates" / "state.mdx"


class InvalidMemoryError(ValueError):
    """Existing relations cannot safely be rewritten."""


def _read_text(path):
    try:
        with path.open(encoding="utf-8", newline="") as stream:
            return stream.read()
    except FileNotFoundError:
        return ""


def _replace_text(path, text):
    path.parent.mkdir(parents=True, exist_ok=True)
    stream = NamedTemporaryFile(
        mode="w", encoding="utf-8", newline="", dir=path.parent, delete=False
    )
    temporary = Path(stream.name)
    try:
        with stream:
            stream.write(text)
        temporary.replace(path)
    finally:
        temporary.unlink(missing_ok=True)


def _append_json(path, record):
    path.parent.mkdir(parents=True, exist_ok=True)
    text = dump_json(record) + "\n"
    with path.open("a", encoding="utf-8", newline="") as stream:
        stream.write(text)


def _base36(number):
    digits = "0123456789abcdefghijklmnopqrstuvwxyz"
    encoded = ""
    while number:
        number, remainder = divmod(number, 36)
        encoded = digits[remainder] + encoded
    return encoded or "0"


def _utc_now():
    return datetime.now(timezone.utc)


def _timestamp(moment):
    return moment.astimezone(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def workspace_root(env=None):
    env = os.environ if env is None else env
    return Path(env.get("CLAUDE_PROJECT_DIR") or env.get("SPIRAL_ROOT") or Path.cwd())


def reflect_every(fallback, env=None):
    env = os.environ if env is None else env
    match = re.match(r"[+-]?[0-9]+", env.get("SPIRAL_REFLECT_EVERY", "").lstrip())
    value = int(match[0]) if match else 0
    return value if value > 0 else fallback


class Workspace:
    def __init__(self, root, now=_utc_now):
        self.directory = Path(root) / ".spiral"
        self.journal_path = self.directory / "journal.jsonl"
        self.memory_path = self.directory / "memory.dot"
        self._now = now

    @contextmanager
    def mutation(self):
        """Serialize Python writers across processes sharing this workspace."""
        self.directory.mkdir(parents=True, exist_ok=True)
        with (self.directory / ".python.lock").open("a+b") as lock:
            if os.name == "nt":
                import msvcrt

                lock.seek(0)
                msvcrt.locking(lock.fileno(), msvcrt.LK_LOCK, 1)
            else:
                import fcntl

                fcntl.flock(lock.fileno(), fcntl.LOCK_EX)
            yield

    def _reject(self, kind, record, errors):
        _append_json(self.directory / "rejected.jsonl", {
            "at": _timestamp(self._now()),
            "kind": kind,
            "errors": errors,
            "record": record,
        })
        return errors

    def append_event(self, event_type, role, data, session=None):
        now = self._now()
        tick = _base36(max(0, int(now.timestamp() * 1000)))
        event = {
            "id": f"e-{tick}-{token_hex(3)}",
            "at": _timestamp(now),
            "type": event_type,
            "actor": {"role": role, "session": session},
            "data": data,
        }
        errors = validate_event(event)
        if errors:
            self._reject("event", event, errors)
            return None
        _append_json(self.journal_path, event)
        return event

    def read_events(self):
        try:
            stream = self.journal_path.open(encoding="utf-8", newline="")
        except FileNotFoundError:
            return
        with stream:
            for line in stream:
                try:
                    event = load_json(line)
                except ValueError:
                    continue
                if not validate_event(event):
                    yield event

    def read_state(self, key):
        text = _read_text(self._state_path(key))
        return parse_frontmatter(text) if text else ({}, "")

    def _state_path(self, key):
        if not isinstance(key, str) or not STATE_KEY.fullmatch(key):
            raise ValueError("key must use only letters, digits, _ or -")
        return self.directory / "state" / f"{key}.mdx"

    def state_value(self, key, fallback):
        meta, _ = self.read_state(key)
        value = meta.get("value")
        return fallback if value is None else value

    def write_state(self, key, value, cause):
        try:
            path = self._state_path(key)
        except ValueError as error:
            record = {"key": key, "value": value, "cause": cause}
            return self._reject("state", record, [str(error)])
        text = _read_text(path)
        meta, body = parse_frontmatter(text) if text else ({}, _read_text(STATE_TEMPLATE))
        version = meta.get("version", 0)
        record = {
            **meta,
            "key": key,
            "value": value,
            "at": _timestamp(self._now()),
            "cause": cause,
            "version": version + 1 if type(version) is int else version,
        }
        errors = validate_state(record)
        if errors:
            return self._reject("state", record, errors)
        _replace_text(path, render_frontmatter(record, body))
        return []

    def read_relations(self, strict=False):
        relations, skipped = parse_dot(_read_text(self.memory_path))
        valid = [relation for relation in relations if not validate_relation(relation)]
        if strict and (skipped or len(valid) != len(relations)):
            raise InvalidMemoryError(f"Unable to safely update {self.memory_path}: unreadable relations.")
        return valid

    def write_relations(self, relations):
        errors = []
        for relation in relations:
            reasons = validate_relation(relation)
            if reasons:
                errors.extend(self._reject("relation", relation, reasons))
        if errors:
            return errors
        _replace_text(self.memory_path, render_dot(relations))
        return []
