#!/usr/bin/env python3
"""Run selected Ball Simulator demo suites through the shared game-test framework."""

from __future__ import annotations

import argparse
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
import json
import os
from pathlib import Path
import subprocess
import sys


VERIFICATION_ROOT = Path(__file__).resolve().parents[1]
WORKTREES_ROOT = VERIFICATION_ROOT.parents[1]
DEFAULT_DEMO_ROOT = WORKTREES_ROOT / "godot-ball-simulator-demo" / "BallSimulatorDemo"
DEFAULT_FRAMEWORK_ROOT = WORKTREES_ROOT / "game-test-framework-godot"
AVAILABLE_SUITES = ("smoke", "ballistic", "isolation")


@dataclass(frozen=True)
class SuiteResult:
    identifier: str
    passed: bool
    exit_code: int
    log_path: str


def resolve_roots() -> tuple[Path, Path]:
    demo_root = Path(os.environ.get("BALL_SIMULATOR_DEMO_ROOT", DEFAULT_DEMO_ROOT)).resolve()
    framework_root = Path(os.environ.get("GAME_TEST_FRAMEWORK_ROOT", DEFAULT_FRAMEWORK_ROOT)).resolve()
    return demo_root, framework_root


def build_framework_command(framework_root: Path, config_path: Path, suite: str | None, manual_rhi: bool, dry_run: bool) -> list[str]:
    command = [sys.executable, "-m", "game_test_framework", "--config", str(config_path)]
    if manual_rhi:
        command.append("--manual-rhi")
    elif suite:
        command.extend(["--suite", suite])
    if dry_run:
        command.append("--dry-run")
    return command


def _environment(framework_root: Path) -> dict[str, str]:
    environment = os.environ.copy()
    framework_src = str(framework_root / "src")
    environment["PYTHONPATH"] = framework_src if not environment.get("PYTHONPATH") else framework_src + os.pathsep + environment["PYTHONPATH"]
    return environment


def run_suite(demo_root: Path, framework_root: Path, suite: str) -> SuiteResult:
    config_path = demo_root / "Tools" / "Testing" / "ProjectTests.json"
    report_directory = VERIFICATION_ROOT / "Saved" / "Verification" / suite / datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    report_directory.mkdir(parents=True, exist_ok=False)
    log_path = report_directory / f"{suite}.log"
    command = build_framework_command(framework_root, config_path, suite, False, False)
    completed = subprocess.run(command, cwd=demo_root, env=_environment(framework_root), capture_output=True, text=True, check=False)
    log_path.write_text(completed.stdout + completed.stderr, encoding="utf-8")
    return SuiteResult(suite, completed.returncode == 0, completed.returncode, str(log_path))


def _assert_layout(demo_root: Path, framework_root: Path) -> None:
    missing = [
        path for path in (
            demo_root / "project.godot",
            demo_root / "Tools" / "Testing" / "ProjectTests.json",
            framework_root / "src" / "game_test_framework" / "__main__.py",
        ) if not path.is_file()
    ]
    if missing:
        raise FileNotFoundError("Required demo/framework files are missing: " + ", ".join(str(path) for path in missing))


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--suite", action="append", choices=[*AVAILABLE_SUITES, "all"], help="Verification suite; defaults to all.")
    parser.add_argument("--list", action="store_true", help="List selectable suites.")
    parser.add_argument("--manual-rhi", action="store_true", help="Delegate visible renderer execution to the shared framework.")
    parser.add_argument("--dry-run", action="store_true", help="Validate and print the visible-RHI command without launching it.")
    args = parser.parse_args()

    if args.list:
        print("\n".join([*AVAILABLE_SUITES, "manual-rhi"]))
        return 0
    demo_root, framework_root = resolve_roots()
    try:
        _assert_layout(demo_root, framework_root)
    except FileNotFoundError as error:
        print(f"[FAIL] {error}", file=sys.stderr)
        return 2

    config_path = demo_root / "Tools" / "Testing" / "ProjectTests.json"
    if args.manual_rhi:
        command = build_framework_command(framework_root, config_path, None, True, args.dry_run)
        completed = subprocess.run(command, cwd=demo_root, env=_environment(framework_root), check=False)
        return completed.returncode

    selected = args.suite or ["all"]
    requested = list(AVAILABLE_SUITES) if "all" in selected else list(dict.fromkeys(selected))
    results = [run_suite(demo_root, framework_root, suite) for suite in requested]
    summary_directory = VERIFICATION_ROOT / "Saved" / "Verification"
    summary_directory.mkdir(parents=True, exist_ok=True)
    summary_path = summary_directory / "latest-summary.json"
    summary_path.write_text(json.dumps([asdict(result) for result in results], ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    for result in results:
        print("[PASS]" if result.passed else "[FAIL]", result.identifier, result.log_path)
    print(f"[REPORT] {summary_path}")
    return 0 if all(result.passed for result in results) else 1


if __name__ == "__main__":
    raise SystemExit(main())
