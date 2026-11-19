"""Run a local GameScaling checkpoint on Windows with Transformers."""

from __future__ import annotations

import argparse
import base64
import binascii
import gc
import io
import json
import logging
import math
import re
import sys
import time
from collections import deque
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path

from PIL import Image, UnidentifiedImageError

# The upstream checkout contains the gamescaling Python package.
sys.path.insert(0, str(Path(__file__).resolve().parent / "gamescaling"))
from gamescaling import (
    ACTION_END,
    ACTION_START,
    CHUNK_STEPS,
    KEY_VOCAB,
    USER_TURN_TEXT,
    PolicyConfig,
    finalize,
    parse_action,
)
from gamescaling.action import MAX_KEYS_PER_STEP, MOUSE_LIMIT, SCROLL_LIMIT

LOG = logging.getLogger(__name__)
MAX_BODY_BYTES = 8 * 1024 * 1024
MAX_IMAGE_PIXELS = 4096 * 4096
MAX_PROMPT_CHARS = 12_000
MAX_INSTRUCTION_CHARS = 2_000
MAX_PREVIOUS_ACTION_CHARS = 1_024
PNG_DATA_PREFIX = "data:image/png;base64,"
ACTION_NUMBER = re.compile(r"-?(?:[0-9]+(?:\.[0-9]+)?)(?:[eE][+-]?[0-9]+)?")


class InvalidFrame(ValueError):
    pass


def decode_frame(encoded: str, image_size: tuple[int, int]) -> Image.Image:
    """Decode a bounded PNG and resize it to fit the model input."""
    try:
        png = base64.b64decode(encoded.removeprefix(PNG_DATA_PREFIX), validate=True)
    except (binascii.Error, ValueError) as exc:
        raise InvalidFrame("image must contain valid base64") from exc

    try:
        with Image.open(io.BytesIO(png), formats=("PNG",)) as image:
            if image.width * image.height > MAX_IMAGE_PIXELS:
                raise InvalidFrame("image exceeds the input pixel limit")
            frame = image.convert("RGB")
    except (UnidentifiedImageError, OSError, Image.DecompressionBombError) as exc:
        raise InvalidFrame("image must be a valid PNG") from exc

    frame.thumbnail(image_size, Image.Resampling.BILINEAR)
    if min(frame.size) < 32:
        raise InvalidFrame("image must be at least 32 pixels along each resized edge")
    return frame


def screen_turn(instruction: str = "") -> dict:
    text = f"{USER_TURN_TEXT}\n\n{instruction}" if instruction else USER_TURN_TEXT
    return {
        "role": "user",
        "content": [{"type": "text", "text": text}, {"type": "image"}],
    }


def is_executed_action(value: object) -> bool:
    """Accept one bounded, executable chunk as an assistant history turn."""
    if not isinstance(value, str) or not (0 < len(value) <= MAX_PREVIOUS_ACTION_CHARS):
        return False
    if not value.startswith(ACTION_START) or not value.endswith(ACTION_END):
        return False
    mouse, *groups = value[len(ACTION_START):-len(ACTION_END)].split(";")
    components = mouse.split()
    if len(components) != 3 or len(groups) != CHUNK_STEPS:
        return False
    for component, limit in zip(components, (MOUSE_LIMIT, MOUSE_LIMIT, SCROLL_LIMIT)):
        if not ACTION_NUMBER.fullmatch(component) or not -limit <= float(component) <= limit:
            return False
    for group in groups:
        keys = group.split()
        if len(keys) > MAX_KEYS_PER_STEP or any(key not in KEY_VOCAB for key in keys):
            return False
    return True


def checkpoint_metadata(model_path: Path) -> dict:
    metadata = {"model": model_path.name, "model_revision": None, "model_sha256": None}
    manifest_path = model_path / "download-manifest.json"
    try:
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        revision = manifest["revision"]
        weights_hash = next(
            (entry["sha256"] for entry in manifest["files"] if entry["file"] == "model.safetensors"),
            None,
        )
        if not isinstance(revision, str) or (
            weights_hash is not None and not isinstance(weights_hash, str)
        ):
            raise ValueError("Expected revision and hash strings")
    except FileNotFoundError:
        return metadata
    except (OSError, ValueError, KeyError, TypeError):
        LOG.warning("Could not read checkpoint metadata from %s", manifest_path)
        return metadata
    # The download manifest records the hash computed when the weights were fetched.
    return {
        **metadata,
        "model_revision": revision,
        "model_sha256": weights_hash,
    }


class LocalGameScaling:
    def __init__(
        self,
        model_path: Path,
        device: str,
        history_frames: int,
        image_size: tuple[int, int],
        max_new_tokens: int,
        seed: int,
        cpu_threads: int,
        temperature: float,
    ) -> None:
        import torch
        from transformers import AutoProcessor, Qwen3_5ForConditionalGeneration

        self.torch = torch
        self.model_class = Qwen3_5ForConditionalGeneration
        self.model_path = model_path
        self.checkpoint = checkpoint_metadata(model_path)
        self.image_size = image_size
        self.max_new_tokens = max_new_tokens
        self.temperature = temperature
        self.seed = seed
        self.auto_device = device == "auto"
        self.history: deque[tuple[Image.Image, str]] = deque(maxlen=history_frames)
        self.episode: tuple[str, str] | None = None
        self.policy_config = PolicyConfig(reasoning=False)
        self.chat_template = (model_path / "chat_template.jinja").read_text(encoding="utf-8")
        self.processor = AutoProcessor.from_pretrained(
            model_path, local_files_only=True, trust_remote_code=False
        )
        self.tokenizer = self.processor.tokenizer
        for tag in (ACTION_START, ACTION_END):
            ids = self.tokenizer.encode(tag, add_special_tokens=False)
            if self.tokenizer.decode(ids, skip_special_tokens=False) != tag:
                raise ValueError(f"The checkpoint tokenizer cannot preserve {tag}")
        torch.set_num_threads(cpu_threads)
        torch.manual_seed(seed)

        if device == "auto":
            device = "cuda" if torch.cuda.is_available() else "cpu"
            if device == "cpu":
                LOG.info("CUDA unavailable. Using CPU inference.")
        elif device == "cuda" and not torch.cuda.is_available():
            raise RuntimeError("CUDA requested but unavailable in this PyTorch installation")

        try:
            self._load_model(device)
            return
        except torch.OutOfMemoryError:
            if not self.auto_device or device != "cuda":
                raise
        self._fallback_to_cpu("loading the model")

    def _load_model(self, device: str) -> None:
        if device == "cuda":
            dtype = (
                self.torch.bfloat16
                if self.torch.cuda.is_bf16_supported(including_emulation=False)
                else self.torch.float16
            )
        else:
            dtype = self.torch.float32
        LOG.info("Loading %s on %s (%s)", self.model_path, device, dtype)
        self.model = self.model_class.from_pretrained(
            self.model_path,
            local_files_only=True,
            use_safetensors=True,
            dtype=dtype,
            device_map={"": device},
        ).eval()
        self.device = device
        self.dtype = dtype
        eos = self.model.generation_config.eos_token_id
        self.eos_ids = [eos] if isinstance(eos, int) else list(eos or [])

    def _fallback_to_cpu(self, operation: str) -> None:
        LOG.warning("CUDA ran out of memory while %s. Switching to CPU inference.", operation)
        self.model = None
        gc.collect()
        self.torch.cuda.empty_cache()
        self._load_model("cpu")

    def gpu_stats(self) -> dict | None:
        if self.device != "cuda":
            return None
        cuda = self.torch.cuda
        free, total = cuda.mem_get_info()
        return {
            "name": cuda.get_device_name(),
            "memory_allocated_mb": round(cuda.memory_allocated() / 2**20, 1),
            "memory_reserved_mb": round(cuda.memory_reserved() / 2**20, 1),
            "memory_free_mb": round(free / 2**20, 1),
            "memory_total_mb": round(total / 2**20, 1),
        }

    def _run_metadata(self) -> dict:
        return {
            **self.checkpoint,
            "device": self.device,
            "dtype": str(self.dtype).removeprefix("torch."),
            "gpu": self.gpu_stats(),
            "temperature": self.temperature,
            "seed": self.seed,
        }

    def health(self) -> dict:
        return {
            "status": "ok",
            **self._run_metadata(),
            "history_frames": self.history.maxlen,
            "max_image_size": self.image_size,
            "max_new_tokens": self.max_new_tokens,
        }

    def _generate(self, prompt: str, frame: Image.Image, instruction: str = "") -> tuple[list[int], int]:
        messages = [{"role": "system", "content": prompt}]
        images = []
        for past_frame, past_action in self.history:
            messages.append(screen_turn())
            messages.append({"role": "assistant", "content": past_action})
            images.append(past_frame)
        messages.append(screen_turn(instruction))
        images.append(frame)
        messages.append({"role": "assistant", "content": self.policy_config.prefill})

        rendered = self.processor.apply_chat_template(
            messages,
            chat_template=self.chat_template,
            tokenize=False,
            add_generation_prompt=False,
            continue_final_message=True,
        )
        if not rendered.endswith(self.policy_config.prefill):
            raise RuntimeError("The checkpoint chat template did not preserve the assistant prefill")
        inputs = self.processor(
            text=[rendered],
            images=images,
            add_special_tokens=False,
            return_tensors="pt",
        ).to(self.device, self.dtype)
        prompt_tokens = inputs["input_ids"].shape[1]
        sampling = {"do_sample": self.temperature > 0}
        if self.temperature > 0:
            sampling.update(temperature=self.temperature, top_p=1.0, top_k=0)
        with self.torch.inference_mode():
            output = self.model.generate(
                **inputs,
                **sampling,
                max_new_tokens=self.max_new_tokens,
                stop_strings=[ACTION_END],
                tokenizer=self.tokenizer,
                use_cache=True,
                return_dict_in_generate=False,
            )
        return output[0, prompt_tokens:].tolist(), prompt_tokens

    def act(
        self, game: str, encoded: str, prompt: str, reset: bool, *,
        instruction: str = "", previous_action: str | None = None,
    ) -> dict:
        start = time.perf_counter()
        frame = decode_frame(encoded, self.image_size)
        episode = (game, prompt)
        if reset or episode != self.episode:
            self.history.clear()
            if self.temperature > 0:
                self.torch.manual_seed(self.seed)
        elif previous_action is not None and self.history:
            past_frame, _ = self.history[-1]
            self.history[-1] = (past_frame, previous_action)
        self.episode = episode

        try:
            ids, prompt_tokens = self._generate(prompt, frame, instruction)
        except self.torch.OutOfMemoryError:
            if not self.auto_device or self.device != "cuda":
                raise
            # Retry after this handler so its traceback can release CUDA tensors.
            ids = None
        if ids is None:
            self._fallback_to_cpu("generating an action")
            ids, prompt_tokens = self._generate(prompt, frame, instruction)

        completion_tokens = len(ids)
        last_token = ids[-1] if ids else None
        chat_eos = last_token in self.eos_ids
        if chat_eos:
            ids = ids[:-1]
        continuation = self.tokenizer.decode(
            ids, skip_special_tokens=False, clean_up_tokenization_spaces=False
        )
        body, action_end, _ = continuation.partition(ACTION_END)
        finish = "stop" if action_end or chat_eos else "length"
        text = finalize(body + action_end, finish, self.policy_config)
        action = parse_action(text)
        self.history.append((frame, action.history_text))

        return {
            "text": text,
            "action": {
                "mouse": action.mouse,
                "steps": action.steps,
                "parsed": action.parsed,
                "truncated": action.truncated or finish == "length",
            },
            "latency_ms": round((time.perf_counter() - start) * 1000, 1),
            "tokens": {
                "prompt": prompt_tokens,
                "completion": completion_tokens,
                "total": prompt_tokens + completion_tokens,
            },
            **self._run_metadata(),
            "finish_reason": finish,
        }


class InferenceServer(HTTPServer):
    """Use a single worker to keep model requests and frame history ordered."""

    def __init__(self, port: int, engine: LocalGameScaling) -> None:
        self.engine = engine
        super().__init__(("127.0.0.1", port), InferenceHandler)


class InferenceHandler(BaseHTTPRequestHandler):
    server: InferenceServer

    def setup(self) -> None:
        self.request.settimeout(15)
        super().setup()

    def _reply(self, status: HTTPStatus, payload: dict) -> None:
        body = json.dumps(payload, allow_nan=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self) -> None:
        if self.path == "/health":
            self._reply(HTTPStatus.OK, self.server.engine.health())
        else:
            self._reply(HTTPStatus.NOT_FOUND, {"error": "Unknown endpoint"})

    def do_POST(self) -> None:
        if self.path != "/act":
            self._reply(HTTPStatus.NOT_FOUND, {"error": "Unknown endpoint"})
            return
        if self.headers.get_content_type() != "application/json":
            self._reply(HTTPStatus.UNSUPPORTED_MEDIA_TYPE, {"error": "Expected application/json"})
            return
        try:
            size = int(self.headers.get("Content-Length", "0"))
        except ValueError:
            size = 0
        if size > MAX_BODY_BYTES:
            self._reply(HTTPStatus.REQUEST_ENTITY_TOO_LARGE, {"error": "Request exceeds 8 MiB"})
            return
        if size <= 0:
            self._reply(HTTPStatus.BAD_REQUEST, {"error": "Expected a nonempty JSON body"})
            return
        try:
            body = json.loads(self.rfile.read(size))
        except (ValueError, RecursionError):
            self._reply(HTTPStatus.BAD_REQUEST, {"error": "Invalid JSON"})
            return
        if not isinstance(body, dict):
            self._reply(HTTPStatus.BAD_REQUEST, {"error": "Expected a JSON object"})
            return
        game = body.get("game")
        image = body.get("image")
        prompt = body.get("system_prompt")
        reset = body.get("reset", False)
        if (
            not isinstance(game, str)
            or not game.strip()
            or len(game) > 200
            or not isinstance(image, str)
            or not image
            or not isinstance(prompt, str)
            or not prompt.strip()
            or len(prompt) > MAX_PROMPT_CHARS
            or not isinstance(reset, bool)
        ):
            self._reply(
                HTTPStatus.BAD_REQUEST,
                {"error": "Expected game, image, system_prompt, and optional boolean reset"},
            )
            return
        instruction = body.get("instruction", "")
        if not isinstance(instruction, str) or len(instruction) > MAX_INSTRUCTION_CHARS:
            self._reply(
                HTTPStatus.BAD_REQUEST,
                {"error": f"instruction must be a string of at most {MAX_INSTRUCTION_CHARS} characters"},
            )
            return
        previous_action = body.get("previous_action")
        if "previous_action" in body and not is_executed_action(previous_action):
            self._reply(
                HTTPStatus.BAD_REQUEST,
                {"error": f"previous_action must be one complete action chunk of at most {MAX_PREVIOUS_ACTION_CHARS} characters"},
            )
            return
        try:
            result = self.server.engine.act(
                game, image, prompt, reset,
                instruction=instruction.strip(), previous_action=previous_action,
            )
        except InvalidFrame as exc:
            self._reply(HTTPStatus.BAD_REQUEST, {"error": str(exc)})
            return
        except Exception:
            LOG.exception("Action generation failed")
            self._reply(HTTPStatus.INTERNAL_SERVER_ERROR, {"error": "Action generation failed"})
            return
        self._reply(HTTPStatus.OK, result)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--model", required=True, type=Path, help="Local checkpoint directory")
    parser.add_argument("--port", type=int, default=8765)
    parser.add_argument("--device", choices=("auto", "cuda", "cpu"), default="auto")
    parser.add_argument("--history-frames", type=int, choices=(0, 1), default=0)
    parser.add_argument("--max-width", type=int, default=640)
    parser.add_argument("--max-height", type=int, default=360)
    parser.add_argument("--max-new-tokens", type=int, default=96)
    parser.add_argument("--temperature", type=float, default=0.0, help="0 for greedy decoding")
    parser.add_argument("--seed", type=int, default=0, help="Sampling seed reset at episode start")
    parser.add_argument("--cpu-threads", type=int, default=8)
    args = parser.parse_args()
    if not args.model.is_dir() or not (args.model / "chat_template.jinja").is_file():
        parser.error("--model must point to a checkpoint directory with chat_template.jinja")
    if not 1 <= args.port <= 65535:
        parser.error("--port must be between 1 and 65535")
    if not (32 <= args.max_width <= 1920 and 32 <= args.max_height <= 1080):
        parser.error("--max-width must be 32..1920 and --max-height 32..1080")
    if not 1 <= args.max_new_tokens <= 256:
        parser.error("--max-new-tokens must be between 1 and 256")
    if not math.isfinite(args.temperature) or args.temperature < 0:
        parser.error("--temperature must be a finite nonnegative number")
    if not -(2**63) <= args.seed < 2**64:
        parser.error("--seed is outside the PyTorch seed range")
    if args.cpu_threads < 1:
        parser.error("--cpu-threads must be a positive integer")

    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    engine = LocalGameScaling(
        args.model.resolve(), args.device, args.history_frames,
        (args.max_width, args.max_height), args.max_new_tokens, args.seed,
        args.cpu_threads, args.temperature,
    )
    with InferenceServer(args.port, engine) as server:
        LOG.info(
            "GameScaling ready on http://127.0.0.1:%d (%s, temperature=%g, seed=%d)",
            args.port, engine.device, engine.temperature, engine.seed,
        )
        try:
            server.serve_forever()
        except KeyboardInterrupt:
            pass


if __name__ == "__main__":
    main()
