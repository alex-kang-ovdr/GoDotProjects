from __future__ import annotations

import os
import sys
import unittest
from pathlib import Path

TOOLS_DIRECTORY = Path(__file__).resolve().parents[1] / "tools"
sys.path.insert(0, str(TOOLS_DIRECTORY))

from run_ball_sim_verification import AVAILABLE_SUITES, build_framework_command, resolve_roots  # noqa: E402


class VerificationRunnerTests(unittest.TestCase):
    def test_declares_the_m1_suite_contract(self) -> None:
        self.assertEqual(AVAILABLE_SUITES, ("smoke", "ballistic", "isolation"))

    def test_builds_shared_framework_command(self) -> None:
        framework_root = Path("D:/Framework")
        config_path = Path("D:/Test/Tools/Testing/ProjectTests.json")
        command = build_framework_command(framework_root, config_path, "ballistic", False, False)
        self.assertEqual(command[:3], [sys.executable, "-m", "game_test_framework"])
        self.assertIn("ballistic", command)
        self.assertIn(str(config_path), command)

    def test_environment_overrides_take_precedence(self) -> None:
        previous_test = os.environ.get("BALL_SIMULATOR_TEST_ROOT")
        previous_framework = os.environ.get("GAME_TEST_FRAMEWORK_ROOT")
        os.environ["BALL_SIMULATOR_TEST_ROOT"] = "D:/TestOverride"
        os.environ["GAME_TEST_FRAMEWORK_ROOT"] = "D:/FrameworkOverride"
        try:
            test_root, framework_root = resolve_roots()
            self.assertEqual(test_root, Path("D:/TestOverride").resolve())
            self.assertEqual(framework_root, Path("D:/FrameworkOverride").resolve())
        finally:
            if previous_test is None:
                os.environ.pop("BALL_SIMULATOR_TEST_ROOT", None)
            else:
                os.environ["BALL_SIMULATOR_TEST_ROOT"] = previous_test
            if previous_framework is None:
                os.environ.pop("GAME_TEST_FRAMEWORK_ROOT", None)
            else:
                os.environ["GAME_TEST_FRAMEWORK_ROOT"] = previous_framework
