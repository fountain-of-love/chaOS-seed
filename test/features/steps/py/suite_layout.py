from pathlib import Path

from behave import step


def module_names(directory, extension):
    return sorted(entry.stem for entry in directory.iterdir() if entry.is_file() and entry.suffix == extension)


@step("this runner has exactly these step modules:")
def check_module_names(context):
    expected = sorted(row["module"] for row in context.table)
    actual = module_names(Path(__file__).resolve().parent, ".py")
    assert actual == expected, f"Expected .py modules: {expected}. Found: {actual}."
