"""Required fields and validation for the shared .spiral records."""

import re
import sys


EVENT_FIELDS = ("id", "at", "type", "actor", "data")
STATE_FIELDS = ("key", "value", "at", "cause", "version")
RELATION_FIELDS = ("from", "type", "to", "weight", "evidence")
ACTOR_ROLES = ("person", "agent", "tool")

ISO_TIME = re.compile(r"[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(\.[0-9]+)?Z")
EVENT_ID = re.compile(r"e-[a-z0-9-]+")
STATE_KEY = re.compile(r"[A-Za-z0-9_-]+")
RELATION_TYPE = re.compile(r"[a-z][a-z0-9_-]*")


def _matches(pattern, value):
    return isinstance(value, str) and pattern.fullmatch(value) is not None


def _text(value):
    return isinstance(value, str) and bool(value.strip())


def _relation_label(value):
    return _text(value) and "\n" not in value and "\r" not in value


def _weight(value):
    limit = sys.float_info.max
    return type(value) in (int, float) and -limit <= value <= limit


def _check(record, fields, rules):
    if not isinstance(record, dict):
        return ["not an object"]
    errors = [f"missing {field}" for field in fields if field not in record]
    errors.extend(message for field, valid, message in rules if field in record and not valid(record[field]))
    return errors


def validate_event(record):
    return _check(record, EVENT_FIELDS, (
        ("id", lambda value: _matches(EVENT_ID, value), "id must look like e-<letters, digits or dashes>"),
        ("at", lambda value: _matches(ISO_TIME, value), "at must be an ISO 8601 UTC time"),
        ("type", _text, "type must be a non-empty string"),
        ("actor", lambda value: isinstance(value, dict) and value.get("role") in ACTOR_ROLES,
         f"actor.role must be one of: {', '.join(ACTOR_ROLES)}"),
        ("data", lambda value: isinstance(value, dict), "data must be an object"),
    ))


def validate_state(record):
    return _check(record, STATE_FIELDS, (
        ("key", lambda value: _matches(STATE_KEY, value), "key must use only letters, digits, _ or -"),
        ("at", lambda value: _matches(ISO_TIME, value), "at must be an ISO 8601 UTC time"),
        ("cause", lambda value: _matches(EVENT_ID, value), "cause must be the id of the event that caused it"),
        ("version", lambda value: type(value) is int and value >= 1, "version must be a whole number from 1"),
    ))


def validate_relation(record):
    return _check(record, RELATION_FIELDS, (
        ("from", _relation_label, "from must be a non-empty, single-line string"),
        ("type", lambda value: _matches(RELATION_TYPE, value), "type must be a lowercase verb such as follows or prefers"),
        ("to", _relation_label, "to must be a non-empty, single-line string"),
        ("weight", _weight, "weight must be a number"),
        ("evidence", lambda value: isinstance(value, list) and all(_matches(EVENT_ID, item) for item in value),
         "evidence must be a list of event ids"),
    ))
