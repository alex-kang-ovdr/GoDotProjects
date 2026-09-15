"""Reusable process/report primitives for Godot plugin test runners."""

from __future__ import annotations

from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from pathlib import Path
import json
import subprocess
from typing import Sequence


@dataclass(frozen=True)
class SuiteResult:
    name: str
    passed: bool
    command: list[str]
    exit_code: int | None
    duration_seconds: float
    log_path: str
    message: str = ""


class TestFramework:
    def __init__(self, report_root: Path) -> None:
        stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
        self.report_dir = report_root / stamp
        self.report_dir.mkdir(parents=True, exist_ok=True)
        self.results: list[SuiteResult] = []

    def run_process(self, name: str, command: Sequence[str], timeout_seconds: int) -> SuiteResult:
        started = datetime.now(timezone.utc)
        log_path = self.report_dir / f"{name}.log"
        try:
            completed = subprocess.run(
                list(command),
                check=False,
                capture_output=True,
                text=True,
                timeout=timeout_seconds,
            )
            duration = (datetime.now(timezone.utc) - started).total_seconds()
            output = completed.stdout + completed.stderr
            log_path.write_text(output, encoding="utf-8")
            result = SuiteResult(
                name=name,
                passed=completed.returncode == 0,
                command=list(command),
                exit_code=completed.returncode,
                duration_seconds=duration,
                log_path=str(log_path),
                message="" if completed.returncode == 0 else "Process returned a non-zero exit code.",
            )
        except subprocess.TimeoutExpired as error:
            duration = (datetime.now(timezone.utc) - started).total_seconds()
            timed_output = (error.stdout or "") + (error.stderr or "")
            log_path.write_text(timed_output, encoding="utf-8")
            result = SuiteResult(
                name=name,
                passed=False,
                command=list(command),
                exit_code=None,
                duration_seconds=duration,
                log_path=str(log_path),
                message=f"Timed out after {timeout_seconds} seconds.",
            )
        self.results.append(result)
        return result

    def record_manual_launch(self, name: str, command: Sequence[str]) -> SuiteResult:
        log_path = self.report_dir / f"{name}.log"
        subprocess.Popen(list(command), cwd=Path(command[0]).parent)
        log_path.write_text("Manual RHI scene launched. Close the Godot window when inspection is complete.\n", encoding="utf-8")
        result = SuiteResult(
            name=name,
            passed=True,
            command=list(command),
            exit_code=None,
            duration_seconds=0.0,
            log_path=str(log_path),
            message="Manual launch requested; visual correctness is not an automated pass.",
        )
        self.results.append(result)
        return result

    def write_summary(self) -> Path:
        summary_path = self.report_dir / "summary.json"
        summary_path.write_text(
            json.dumps([asdict(result) for result in self.results], ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )
        return summary_path
