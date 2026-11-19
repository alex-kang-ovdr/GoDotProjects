"""Offline checks for the local GameScaling HTTP and decoding contract."""

import base64
import io
import threading
import unittest
from collections import deque
from contextlib import nullcontext
from unittest.mock import MagicMock, Mock

import requests
from PIL import Image

from inference_server import (
    ACTION_END,
    ACTION_START,
    InferenceServer,
    InvalidFrame,
    LocalGameScaling,
    MAX_INSTRUCTION_CHARS,
    MAX_PREVIOUS_ACTION_CHARS,
    PolicyConfig,
    USER_TURN_TEXT,
    decode_frame,
)


def encoded_frame(format_name: str = "PNG") -> str:
    buffer = io.BytesIO()
    Image.new("RGB", (1280, 720)).save(buffer, format=format_name)
    return base64.b64encode(buffer.getvalue()).decode("ascii")


class InferenceServerTests(unittest.TestCase):
    def setUp(self):
        self.engine = LocalGameScaling.__new__(LocalGameScaling)
        self.engine.device = "cpu"
        self.engine.dtype = "float32"
        self.engine.checkpoint = {
            "model": "test-checkpoint",
            "model_revision": "test-revision",
            "model_sha256": "test-hash",
        }
        self.engine.max_new_tokens = 96
        self.engine.temperature = 0.0
        self.engine.seed = 42
        self.engine.image_size = (640, 360)
        self.engine.history = deque(maxlen=1)
        self.engine.episode = None
        self.engine.eos_ids = [248046]
        self.engine.policy_config = PolicyConfig(reasoning=False)
        self.engine.tokenizer = Mock()
        self.engine._generate = Mock(return_value=([1, 2, 3], 123))
        self.engine.tokenizer.decode.return_value = (
            f"\n\n{ACTION_START}-37 -3 0 ; LB S ; LB ; LB ; LB ; LB ; LB{ACTION_END}\n"
        )
        self.server = InferenceServer(0, self.engine)
        worker = threading.Thread(target=self.server.serve_forever, args=(0.01,), daemon=True)
        worker.start()
        self.addCleanup(worker.join)
        self.addCleanup(self.server.server_close)
        self.addCleanup(self.server.shutdown)
        self.base = f"http://127.0.0.1:{self.server.server_port}"
        self.request = {"game": "Test", "image": encoded_frame(), "system_prompt": "Play the game."}

    def act(self, **fields):
        return requests.post(f"{self.base}/act", json={**self.request, **fields}, timeout=5)

    def test_action_end_and_usage(self):
        health = requests.get(f"{self.base}/health", timeout=5)
        self.assertEqual(health.status_code, 200)
        health_body = health.json()
        self.assertEqual(health_body["history_frames"], 1)
        response = self.act(reset=True)
        self.assertEqual(response.status_code, 200)
        payload = response.json()
        expected_metadata = {
            **self.engine.checkpoint,
            "temperature": 0.0,
            "seed": 42,
            "dtype": "float32",
        }
        for key, value in expected_metadata.items():
            self.assertEqual(health_body[key], value)
            self.assertEqual(payload[key], value)
        self.assertEqual(payload["finish_reason"], "stop")
        self.assertTrue(payload["text"].startswith(self.engine.policy_config.prefill))
        self.assertTrue(payload["text"].endswith(ACTION_END))
        self.assertEqual(payload["action"]["mouse"], [-37.0, -3.0, 0.0])
        self.assertEqual(payload["action"]["steps"], [["LB", "S"], *([["LB"]] * 5)])
        self.assertTrue(payload["action"]["parsed"])
        self.assertFalse(payload["action"]["truncated"])
        self.assertEqual(payload["tokens"], {"prompt": 123, "completion": 3, "total": 126})
        self.assertIsNone(payload["gpu"])
        self.assertEqual(self.engine.history[0][0].size, (640, 360))

    def test_generic_eos_keeps_token_count_and_restores_end_tag(self):
        self.engine._generate.return_value = ([1, 2, 248046], 123)
        self.engine.tokenizer.decode.return_value = f"\n\n{ACTION_START}0 0 0 ; ; ; ; ; ; "
        payload = self.act().json()
        self.engine.tokenizer.decode.assert_called_once_with(
            [1, 2], skip_special_tokens=False, clean_up_tokenization_spaces=False
        )
        self.assertEqual(payload["tokens"]["completion"], 3)
        self.assertTrue(payload["text"].endswith(ACTION_END))
        self.assertTrue(payload["action"]["parsed"])

    def test_length_limit_does_not_complete_partial_action(self):
        self.engine.tokenizer.decode.return_value = f"\n\n{ACTION_START}0 0 0 ; W"
        payload = self.act().json()
        self.assertEqual(payload["finish_reason"], "length")
        self.assertFalse(payload["action"]["parsed"])
        self.assertTrue(payload["action"]["truncated"])
        self.assertEqual(payload["action"]["steps"], [[] for _ in range(6)])

    def test_invalid_requests_do_not_generate(self):
        self.assertEqual(self.act(image="!").status_code, 400)
        self.assertEqual(self.act(image=encoded_frame("JPEG")).status_code, 400)
        self.assertEqual(self.act(reset="true").status_code, 400)
        self.engine._generate.assert_not_called()

    def test_invalid_context_fields_do_not_generate(self):
        for field, values in {
            "instruction": (None, [], "X" * (MAX_INSTRUCTION_CHARS + 1)),
            "previous_action": (
                None, [], "", "X" * (MAX_PREVIOUS_ACTION_CHARS + 1),
                f"{ACTION_START}0 0 0 ; W{ACTION_END}",
                f"{ACTION_START}0 0 0 ; Jump ; ; ; ; ; {ACTION_END}",
                f"{ACTION_START}0 0 0 ; W<|im_end|> ; ; ; ; ; {ACTION_END}",
                f"{ACTION_START}0 0 1e300 ; ; ; ; ; ; {ACTION_END}",
            ),
        }.items():
            for value in values:
                with self.subTest(field=field, value=value):
                    response = self.act(**{field: value})
                    self.assertEqual(response.status_code, 400)
                    self.assertIn(field, response.json()["error"])
        self.engine._generate.assert_not_called()

    def test_actions_in_context_follow_execution_and_episode(self):
        captured_history = []

        def generate(*_):
            captured_history.append(list(self.engine.history))
            return [1, 2, 3], 123

        self.engine._generate.side_effect = generate
        original_action = self.engine.tokenizer.decode.return_value.strip()
        applied = f"{ACTION_START}-37.25 -3 0 ; S ; ; ; ; ; {ACTION_END}"

        self.assertEqual(self.act(instruction="First turn.", previous_action=applied).status_code, 200)
        self.assertEqual(captured_history[-1], [])
        previous_frame = self.engine.history[-1][0]
        response = self.act(instruction="Current turn.", previous_action=applied)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(captured_history[-1], [(previous_frame, applied)])
        self.assertTrue(response.json()["text"].endswith(original_action))
        self.assertEqual(self.engine.history[-1][1], original_action)
        self.assertEqual(self.engine._generate.call_args.args[2], "Current turn.")
        self.assertEqual(self.act().status_code, 200)
        self.assertEqual(captured_history[-1][0][1], original_action)

        for fields in ({"reset": True}, {"system_prompt": "New system prompt."}, {"game": "New game"}):
            self.assertEqual(self.act(previous_action=applied, **fields).status_code, 200)
            self.assertEqual(captured_history[-1], [])

    def test_data_url_frame(self):
        frame = decode_frame("data:image/png;base64," + self.request["image"], (320, 320))
        self.assertEqual(frame.size, (320, 180))
        with self.assertRaises(InvalidFrame):
            decode_frame(self.request["image"], (40, 40))

    def test_sampling_seed_resets_at_episode_boundaries(self):
        self.engine.temperature = 1.0
        self.engine.torch = Mock()
        for fields in ({}, {"instruction": "Different advice."}, {"reset": True}, {"game": "Another game"}):
            self.assertEqual(self.act(**fields).status_code, 200)
        self.assertEqual(self.engine.torch.manual_seed.call_count, 3)
        self.engine.torch.manual_seed.assert_called_with(42)

    def prepare_mock_generation(self):
        self.engine.torch = Mock(inference_mode=nullcontext)
        self.engine.chat_template = "template"
        self.engine.processor = Mock()
        self.engine.processor.apply_chat_template.return_value = self.engine.policy_config.prefill
        self.engine.processor.return_value.to.return_value = {"input_ids": Mock(shape=(1, 123))}
        self.engine.model = Mock()
        self.engine.model.generate.return_value = MagicMock()
        return decode_frame(self.request["image"], (640, 360))

    def test_current_screen_instruction_does_not_modify_system_or_history(self):
        frame = self.prepare_mock_generation()
        previous_frame = Image.new("RGB", frame.size, "green")
        applied = f"{ACTION_START}0 0 0 ; W ; ; ; ; ; {ACTION_END}"
        self.engine.history.append((previous_frame, applied))
        LocalGameScaling._generate(self.engine, "Play the game.", frame, "Hold F to fire.")
        messages = self.engine.processor.apply_chat_template.call_args.args[0]
        self.assertEqual(messages[0], {"role": "system", "content": "Play the game."})
        self.assertEqual(messages[1]["content"], [{"type": "text", "text": USER_TURN_TEXT}, {"type": "image"}])
        self.assertEqual(messages[2], {"role": "assistant", "content": applied})
        self.assertEqual(messages[3]["content"], [{"type": "text", "text": USER_TURN_TEXT + "\n\nHold F to fire."}, {"type": "image"}])
        self.assertEqual(self.engine.processor.call_args.kwargs["images"], [previous_frame, frame])

    def test_sampling_options_sent_only_for_positive_temperature(self):
        frame = self.prepare_mock_generation()
        LocalGameScaling._generate(self.engine, "Play the game.", frame)
        kwargs = self.engine.model.generate.call_args.kwargs
        self.assertFalse(kwargs["do_sample"])
        self.assertNotIn("temperature", kwargs)

        self.engine.temperature = 1.0
        LocalGameScaling._generate(self.engine, "Play the game.", frame)
        kwargs = self.engine.model.generate.call_args.kwargs
        self.assertTrue(kwargs["do_sample"])
        self.assertEqual(kwargs["temperature"], 1.0)
        self.assertEqual(kwargs["top_p"], 1.0)
        self.assertEqual(kwargs["top_k"], 0)


if __name__ == "__main__":
    unittest.main()
