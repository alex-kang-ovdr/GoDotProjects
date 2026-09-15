#!/usr/bin/env python3
"""Select and run headless, native, or manual-RHI suites for this Godot plugin."""

from __future__ import annotations

import argparse
from pathlib import Path
import os
import shutil
import sys

from test_framework import TestFramework


PROJECT_ROOT = Path(__file__).resolve().parents[1]
REPORT_ROOT = PROJECT_ROOT / "reports"


def locate_executable(explicit_path: str | None, environment_name: str, candidates: list[Path]) -> Path:
    if explicit_path:
        candidate = Path(explicit_path)
        if candidate.is_file():
            return candidate
        raise FileNotFoundError(f"Executable does not exist: {candidate}")
    environment_value = os.getenv(environment_name)
    if environment_value and Path(environment_value).is_file():
        return Path(environment_value)
    for candidate in candidates:
        if candidate.is_file():
            return candidate
    discovered = shutil.which("godot") if environment_name == "GODOT_BIN" else shutil.which("clang++")
    if discovered:
        return Path(discovered)
    raise FileNotFoundError(f"Set {environment_name} or pass the matching command-line executable option.")


def locate_godot(explicit_path: str | None) -> Path:
    github_root = PROJECT_ROOT.parents[1]
    return locate_executable(
        explicit_path,
        "GODOT_BIN",
        [
            PROJECT_ROOT / ".tools" / "godot" / "Godot_v4.7.2-stable_win64_console.exe",
            github_root / "GoDotProjects" / "Godot_v4.7.2-stable_win64_console.exe",
            github_root / "GoDotProjects" / ".tools" / "godot-4.7.2" / "Godot_v4.7.2-stable_win64_console.exe",
        ],
    )


def locate_native_compiler(explicit_path: str | None) -> Path:
    return locate_executable(
        explicit_path,
        "CXX",
        [
            Path(r"C:\Program Files\Microsoft Visual Studio\2022\Professional\Common7\Tools\VsDevCmd.bat"),
            Path(r"C:\Program Files\LLVM\bin\clang++.exe"),
        ],
    )


def native_compile_command(compiler: Path, include: Path, source: Path, test: Path, output: Path) -> list[str]:
    if compiler.suffix.lower() == ".bat":
        return [
            str(PROJECT_ROOT / "tools" / "run_msvc_compile.bat"),
            str(compiler),
            str(include),
            str(source),
            str(test),
            str(output),
        ]
    return [
        str(compiler),
        "-std=c++20",
        "-Wall",
        "-Wextra",
        "-Werror",
        "-pedantic",
        f"-I{include}",
        str(source),
        str(test),
        "-o",
        str(output),
    ]


def run_native_suite(framework: TestFramework, compiler: Path, timeout_seconds: int) -> bool:
    output = PROJECT_ROOT / "build" / "native" / "ball_simulation_core_tests.exe"
    output.parent.mkdir(parents=True, exist_ok=True)
    include = PROJECT_ROOT / "native" / "include"
    source = PROJECT_ROOT / "native" / "src" / "core" / "ball_simulation_core.cpp"
    test = PROJECT_ROOT / "native" / "tests" / "ball_simulation_core_tests.cpp"
    compile_command = native_compile_command(compiler, include, source, test, output)
    compile_result = framework.run_process("core-unit-build", compile_command, timeout_seconds)
    if not compile_result.passed:
        return False
    return framework.run_process("core-unit", [str(output)], timeout_seconds).passed


def run_godot_suite(framework: TestFramework, godot: Path, suite: str, timeout_seconds: int) -> bool:
    report_path = framework.report_dir / f"{suite}.json"
    command = [
        str(godot),
        "--headless",
        "--path",
        str(PROJECT_ROOT),
        "--script",
        "res://tests/test_runner.gd",
        "--",
        "--suite",
        suite,
        "--report",
        f"res://{report_path.relative_to(PROJECT_ROOT).as_posix()}",
    ]
    return framework.run_process(suite, command, timeout_seconds).passed


def launch_rhi_lab(framework: TestFramework, godot: Path, driver: str) -> None:
    command = [
        str(godot),
        "--path",
        str(PROJECT_ROOT),
        "--scene",
        "res://scenes/bootstrap_rhi_lab.tscn",
        "--rendering-driver",
        driver,
        "--debug",
    ]
    framework.record_manual_launch("rhi-manual", command)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--suite", action="append", default=[], help="Suite: smoke, naming-contract, core-unit, all, rhi-manual.")
    parser.add_argument("--list", action="store_true", help="List available suites and exit.")
    parser.add_argument("--godot", help="Path to a Godot console executable. Overrides GODOT_BIN.")
    parser.add_argument("--cxx", help="Path to VsDevCmd.bat or a configured C++ compiler. Overrides CXX.")
    parser.add_argument("--timeout", type=int, default=120, help="Automated-suite timeout in seconds.")
    parser.add_argument("--rhi-driver", default="d3d12", help="Godot rendering driver for rhi-manual (default: d3d12).")
    args = parser.parse_args()

    available = ["smoke", "naming-contract", "core-unit", "all", "rhi-manual"]
    if args.list:
        print("\n".join(available))
        return 0
    selected = args.suite or ["all"]
    unknown = [suite for suite in selected if suite not in available]
    if unknown:
        parser.error(f"Unknown suite(s): {', '.join(unknown)}")

    framework = TestFramework(REPORT_ROOT)
    passed = True
    requested: list[str] = []
    if "all" in selected:
        requested.extend(["smoke", "naming-contract", "core-unit"])
    requested.extend(suite for suite in selected if suite != "all" and suite not in requested)
    try:
        for suite in requested:
            if suite in {"smoke", "naming-contract"}:
                passed = run_godot_suite(framework, locate_godot(args.godot), suite, args.timeout) and passed
            elif suite == "core-unit":
                passed = run_native_suite(framework, locate_native_compiler(args.cxx), args.timeout) and passed
            elif suite == "rhi-manual":
                launch_rhi_lab(framework, locate_godot(args.godot), args.rhi_driver)
    except (FileNotFoundError, OSError) as error:
        print(f"TEST RUNNER ERROR: {error}", file=sys.stderr)
        passed = False

    summary = framework.write_summary()
    print(f"Reports: {summary}")
    return 0 if passed else 1


if __name__ == "__main__":
    raise SystemExit(main())
