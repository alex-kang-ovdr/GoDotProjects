"""Compatibility entry point; captures v3 production animation."""
import runpy
from pathlib import Path
runpy.run_path(str(Path(__file__).with_name("capture_motion_v3.py")),run_name="__main__")
