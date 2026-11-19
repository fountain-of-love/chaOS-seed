import sys
from pathlib import Path
from tempfile import TemporaryDirectory

from behave.cucumber_expression import use_step_matcher_for_cucumber_expressions

ROOT = Path(__file__).resolve().parents[2]
sys.path[:0] = [str(ROOT), str(ROOT / "test" / "support")]

from python_workspace import ScenarioWorkspace

use_step_matcher_for_cucumber_expressions()


def before_scenario(context, _scenario):
    temporary = TemporaryDirectory(prefix="chaos-behave-")
    context.add_cleanup(temporary.cleanup)
    context.project = ScenarioWorkspace(Path(temporary.name))
    context.relations = []
