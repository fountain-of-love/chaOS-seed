from pathlib import Path

from behave import step
from python_workspace import PYTHON_COMMANDS, PYTHON_SOURCE_ROOT, ROOT


def module_names(directory, extension):
    return sorted(entry.stem for entry in directory.iterdir() if entry.is_file() and entry.suffix == extension)


@step("this runner has exactly these step modules:")
def check_module_names(context):
    expected = sorted(row["module"] for row in context.table)
    actual = module_names(Path(__file__).resolve().parent, ".py")
    assert actual == expected, f"Expected .py modules: {expected}. Found: {actual}."


@step("this runner has exactly these production modules:")
def check_production_modules(context):
    expected = sorted(row["module"] for row in context.table)
    actual = module_names(PYTHON_SOURCE_ROOT, ".py")
    assert actual == expected, f"Expected production .py modules: {expected}. Found: {actual}."


@step("this runner uses these production entry points:")
def check_production_entry_points(context):
    for row in context.table:
        expected = ROOT / f"{row['path']}.py"
        assert getattr(PYTHON_COMMANDS, row["entry"]) == expected
        assert expected.is_file(), f"Missing Python script: {expected}"
