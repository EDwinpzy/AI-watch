#!/usr/bin/env python3
"""Regression tests for the read-only Codex watch bridge."""

from __future__ import annotations

import argparse
import base64
import json
import os
import socketserver
import sys
import tempfile
import threading
import time
import unittest
import urllib.error
import urllib.request
from pathlib import Path
from types import SimpleNamespace
from unittest import mock

SCRIPT_DIR = Path(__file__).resolve().parent
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))

from codex_bridge import CodexRunner, CodexTaskManager, compact_speech_text


FAKE_CODEX = r'''
import json
import os
import subprocess
import sys
import time
from pathlib import Path

args = sys.argv[1:]
output_path = Path(args[args.index("-o") + 1])
mode = os.environ.get("FAKE_CODEX_MODE", "success")
answer = os.environ.get("FAKE_CODEX_ANSWER", "测试完成。")
sys.stdin.reconfigure(encoding="utf-8")
sys.stdout.reconfigure(encoding="utf-8")
prompt = sys.stdin.read()
Path(os.environ["FAKE_CODEX_PROMPT_FILE"]).write_text(prompt, encoding="utf-8")
env_file = os.environ.get("FAKE_CODEX_ENV_FILE")
if env_file:
    Path(env_file).write_text(json.dumps({
        "registeredCore": os.environ.get("CODEX_WINDOWS_REGISTERED_CORE", ""),
        "sandboxFamily": os.environ.get("CODEX_WINDOWS_SANDBOX_PACKAGE_FAMILY", ""),
    }), encoding="utf-8")

print(json.dumps({"type": "thread.started", "thread_id": "fake-thread"}), flush=True)
if mode == "fail":
    print("ERROR fake backend failure", flush=True)
    raise SystemExit(3)
if mode == "cancel":
    child_path = Path(os.environ["FAKE_CODEX_CHILD_FILE"])
    child_source = "\n".join([
        "import sys,time",
        "from pathlib import Path",
        "p=Path(sys.argv[1])",
        "beat=Path(str(p)+'.beat')",
        "while True:",
        "    beat.write_text(str(time.time()),encoding='utf-8')",
        "    time.sleep(0.1)",
    ])
    child_error = open(str(child_path) + ".err", "wb")
    child = subprocess.Popen(
        [sys.executable, "-c", child_source, str(child_path)],
        stdout=subprocess.DEVNULL,
        stderr=child_error,
    )
    child_error.close()
    child_path.write_text(str(child.pid), encoding="utf-8")
if mode == "long":
    seconds = float(os.environ.get("FAKE_CODEX_DURATION", "66"))
    deadline = time.monotonic() + seconds
    while time.monotonic() < deadline:
        print(json.dumps({
            "type": "item.completed",
            "item": {"type": "reasoning", "text": "keep working"},
        }), flush=True)
        time.sleep(5)
else:
    print(json.dumps({
        "type": "item.completed",
        "item": {"type": "reasoning", "text": "think"},
    }), flush=True)
    time.sleep(float(os.environ.get("FAKE_CODEX_DELAY", "0")))

if mode == "cancel":
    time.sleep(30)
print(json.dumps({
    "type": "item.completed",
    "item": {"type": "agent_message", "text": answer},
}), flush=True)
print(json.dumps({
    "type": "turn.completed",
    "usage": {"input_tokens": 1, "output_tokens": 1},
}), flush=True)
output_path.write_text(answer, encoding="utf-8")
'''


class _BackendServer(socketserver.ThreadingTCPServer):
    allow_reuse_address = True


class _BackendHandler(socketserver.BaseRequestHandler):
    def handle(self) -> None:
        try:
            self.request.recv(64)
        except OSError:
            pass


def _open_backend() -> tuple[_BackendServer, int]:
    server = _BackendServer(("127.0.0.1", 0), _BackendHandler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    return server, server.server_address[1]


class CodexBridgeTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.repo = self.root / "repo"
        self.repo.mkdir()
        self.tasks = self.root / "tasks"
        self.fake = self.root / "fake_codex.py"
        self.fake.write_text(FAKE_CODEX, encoding="utf-8")
        self.prompt_file = self.root / "prompt.txt"
        self.answer = "结论：仓库可以正常运行。\n- 保留只读模式。\n- 逐屏完成视觉验收。"
        self.old_env = dict(os.environ)
        os.environ["FAKE_CODEX_PROMPT_FILE"] = str(self.prompt_file)
        os.environ["FAKE_CODEX_ANSWER"] = self.answer
        os.environ["FAKE_CODEX_MODE"] = "success"
        os.environ["FAKE_CODEX_DELAY"] = "0"

    def tearDown(self) -> None:
        os.environ.clear()
        os.environ.update(self.old_env)
        self.temp.cleanup()

    def manager(self, port: int, timeout: int = 10) -> CodexTaskManager:
        return CodexTaskManager(
            repo_allowlist={"watch": self.repo},
            model="fake-model",
            backend_url=f"http://127.0.0.1:{port}/v1",
            timeout_seconds=timeout,
            task_root=self.tasks,
            codex_command=[sys.executable, str(self.fake)],
            log=lambda **payload: None,
            backend_timeout=0.5,
        )

    def wait_terminal(self, manager: CodexTaskManager, task_id: str, timeout: float = 8) -> dict:
        deadline = time.monotonic() + timeout
        while time.monotonic() < deadline:
            task = manager.get(task_id)
            if task["status"] in ("succeeded", "failed", "cancelled"):
                return task
            time.sleep(0.05)
        self.fail("task did not reach a terminal state")

    def test_speech_text_is_short_and_clean(self) -> None:
        text = "# 结论\n```python\nprint('x')\n```\n" + "这是结论。" * 40
        spoken = compact_speech_text(text)
        self.assertLessEqual(len(spoken), 120)
        self.assertNotIn("```", spoken)
        self.assertTrue(spoken.startswith("结论"))

    def test_child_environment_removes_desktop_sandbox_markers(self) -> None:
        with mock.patch.dict(
            os.environ,
            {
                "CODEX_WINDOWS_REGISTERED_CORE": "1",
                "CODEX_WINDOWS_SANDBOX_PACKAGE_FAMILY": "OpenAI.Codex_test",
            },
            clear=False,
        ):
            environment = CodexRunner._child_environment()
        self.assertNotIn("CODEX_WINDOWS_REGISTERED_CORE", environment)
        self.assertNotIn("CODEX_WINDOWS_SANDBOX_PACKAGE_FAMILY", environment)
        self.assertIn("PATH", environment)

    def test_spawned_codex_does_not_inherit_desktop_sandbox_markers(self) -> None:
        server, port = _open_backend()
        env_file = self.root / "fake-env.json"
        os.environ["FAKE_CODEX_ENV_FILE"] = str(env_file)
        os.environ["CODEX_WINDOWS_REGISTERED_CORE"] = "1"
        os.environ["CODEX_WINDOWS_SANDBOX_PACKAGE_FAMILY"] = "OpenAI.Codex_test"
        try:
            manager = self.manager(port)
            task = manager.create(
                prompt="检查子进程环境",
                transcript="检查子进程环境",
                repo_id="watch",
                mode="readonly",
            )
            result = self.wait_terminal(manager, task["taskId"])
        finally:
            server.shutdown()
            server.server_close()
        self.assertEqual(result["status"], "succeeded")
        self.assertEqual(
            json.loads(env_file.read_text(encoding="utf-8")),
            {"registeredCore": "", "sandboxFamily": ""},
        )

    def test_success_parses_jsonl_and_redacts_prompt_logs(self) -> None:
        server, port = _open_backend()
        try:
            manager = self.manager(port)
            task = manager.create(
                prompt="请检查登录模块",
                transcript="请检查登录模块",
                repo_id="watch",
                mode="readonly",
            )
            result = self.wait_terminal(manager, task["taskId"])
        finally:
            server.shutdown()
            server.server_close()

        self.assertEqual(result["status"], "succeeded")
        self.assertEqual(result["finalText"], self.answer)
        self.assertTrue(result["speechText"])
        self.assertLessEqual(len(result["speechText"]), 120)
        self.assertEqual(result["audioUrl"], "")
        wrapped_prompt = self.prompt_file.read_text(encoding="utf-8")
        self.assertIn("只读代码助手", wrapped_prompt)
        event_log = self.tasks / task["taskId"] / "events.jsonl"
        raw_log = event_log.read_text(encoding="utf-8")
        self.assertNotIn("请检查登录模块", raw_log)
        self.assertNotIn("magpie", raw_log.lower())
        self.assertIn("promptChars", raw_log)

    def test_single_active_task_is_enforced(self) -> None:
        server, port = _open_backend()
        os.environ["FAKE_CODEX_MODE"] = "long"
        os.environ["FAKE_CODEX_DURATION"] = "1.5"
        try:
            manager = self.manager(port, timeout=10)
            first = manager.create(
                prompt="第一个任务",
                transcript="第一个任务",
                repo_id="watch",
                mode="readonly",
            )
            with self.assertRaises(RuntimeError):
                manager.create(
                    prompt="第二个任务",
                    transcript="第二个任务",
                    repo_id="watch",
                    mode="readonly",
                )
            self.wait_terminal(manager, first["taskId"])
        finally:
            server.shutdown()
            server.server_close()

    def test_cancel_kills_process_tree(self) -> None:
        server, port = _open_backend()
        os.environ["FAKE_CODEX_MODE"] = "cancel"
        child_path = self.root / "child.pid"
        os.environ["FAKE_CODEX_CHILD_FILE"] = str(child_path)
        try:
            manager = self.manager(port, timeout=30)
            task = manager.create(
                prompt="停止这个任务",
                transcript="停止这个任务",
                repo_id="watch",
                mode="readonly",
            )
            deadline = time.monotonic() + 5
            while not child_path.exists() and time.monotonic() < deadline:
                time.sleep(0.05)
            self.assertTrue(child_path.exists(), "fake child process did not start")
            beat_file = Path(str(child_path) + ".beat")
            while not beat_file.exists() and time.monotonic() < deadline:
                time.sleep(0.05)
            if not beat_file.exists():
                error_file = Path(str(child_path) + ".err")
                detail = error_file.read_text(encoding="utf-8", errors="replace") if error_file.exists() else ""
                self.fail(f"fake child process did not emit a heartbeat: {detail}")
            manager.cancel(task["taskId"])
            result = self.wait_terminal(manager, task["taskId"], timeout=8)
            self.assertTrue(beat_file.exists())
            before = beat_file.stat().st_mtime_ns
            time.sleep(0.8)
            after = beat_file.stat().st_mtime_ns
        finally:
            server.shutdown()
            server.server_close()

        self.assertEqual(result["status"], "cancelled")
        self.assertEqual(before, after, "cancelled task left a child process running")

    def test_backend_unavailable_fails_within_five_seconds(self) -> None:
        manager = self.manager(9, timeout=30)
        started = time.monotonic()
        task = manager.create(
            prompt="后端不可用",
            transcript="后端不可用",
            repo_id="watch",
            mode="readonly",
        )
        result = self.wait_terminal(manager, task["taskId"], timeout=5)
        elapsed = time.monotonic() - started
        self.assertEqual(result["status"], "failed")
        self.assertIn("后端不可用", result["error"])
        self.assertLess(elapsed, 5)

    def test_repo_allowlist_and_mode(self) -> None:
        server, port = _open_backend()
        try:
            manager = self.manager(port)
            with self.assertRaises(ValueError):
                manager.create(
                    prompt="越权",
                    transcript="越权",
                    repo_id="other",
                    mode="readonly",
                )
            with self.assertRaises(ValueError):
                manager.create(
                    prompt="写模式",
                    transcript="写模式",
                    repo_id="watch",
                    mode="workspace-write",
                )
        finally:
            server.shutdown()
            server.server_close()


class _FakeCodexManager:
    def __init__(self) -> None:
        self.tasks: dict[str, dict] = {}

    def health(self) -> dict:
        return {"available": True, "busy": False, "model": "fake"}

    def create(self, *, prompt: str, transcript: str, repo_id: str, mode: str) -> dict:
        task_id = "task-1"
        self.tasks[task_id] = {
            "taskId": task_id,
            "status": "queued",
            "stage": "已排队",
            "transcript": transcript,
            "message": "等待",
            "finalText": "",
            "speechText": "",
            "elapsedMs": 0,
            "error": "",
        }
        threading.Thread(target=self._finish, args=(task_id,), daemon=True).start()
        return self.tasks[task_id]

    def _finish(self, task_id: str) -> None:
        time.sleep(0.1)
        self.tasks[task_id].update(
            status="succeeded",
            stage="完成",
            finalText="完成",
            speechText="完成",
            message="完成",
        )

    def get(self, task_id: str) -> dict:
        return self.tasks[task_id]

    def cancel(self, task_id: str) -> dict:
        return self.get(task_id)


class HttpRouteTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        import ai_service

        cls.ai_service = ai_service
        cls.temp = tempfile.TemporaryDirectory()
        root = Path(cls.temp.name)
        audio = root / "audio"
        audio.mkdir()
        cls.runtime = SimpleNamespace(
            args=SimpleNamespace(
                allow_client={"127.0.0.1"},
                max_body_bytes=4 * 1024 * 1024,
                model="fake-ollama",
                whisper_model="fake-whisper",
                codex_token="secret-token",
            ),
            codex=_FakeCodexManager(),
            audio_dir=audio,
            log=lambda **payload: None,
            transcribe=lambda pcm: {
                "requestId": "asr-1",
                "transcript": "检查仓库结构",
                "elapsedMs": 12,
                "wavPath": "",
            },
            chat=lambda prompt, model: {
                "model": model,
                "reply": "旧语音链路正常",
                "elapsedMs": 10,
                "done": True,
            },
            synthesize=lambda text: audio / "reply.wav",
        )
        ai_service.Handler.runtime = cls.runtime
        cls.server = ai_service.ThreadingHTTPServer(("127.0.0.1", 0), ai_service.Handler)
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()
        cls.base = f"http://127.0.0.1:{cls.server.server_address[1]}"

    @classmethod
    def tearDownClass(cls) -> None:
        cls.server.shutdown()
        cls.server.server_close()
        cls.temp.cleanup()

    def request(self, path: str, *, payload: dict | None = None, token: str = "") -> tuple[int, dict]:
        headers = {"Content-Type": "application/json"}
        if token:
            headers["X-Nova-Token"] = token
        data = None if payload is None else json.dumps(payload).encode("utf-8")
        request = urllib.request.Request(
            self.base + path,
            data=data,
            headers=headers,
            method="POST" if payload is not None else "GET",
        )
        try:
            with urllib.request.urlopen(request, timeout=5) as response:
                return response.status, json.loads(response.read().decode("utf-8"))
        except urllib.error.HTTPError as exc:
            return exc.code, json.loads(exc.read().decode("utf-8"))

    def test_old_voice_route_still_works(self) -> None:
        pcm = base64.b64encode(b"\x00\x00" * 64).decode("ascii")
        status, payload = self.request(
            "/api/voice",
            payload={"pcmBase64": pcm, "model": "fake-ollama"},
        )
        self.assertEqual(status, 200)
        self.assertEqual(payload["reply"], "旧语音链路正常")
        self.assertEqual(payload["transcript"], "检查仓库结构")

    def test_codex_routes_require_token(self) -> None:
        status, payload = self.request(
            "/api/codex/task",
            payload={"prompt": "检查"},
        )
        self.assertEqual(status, 401)
        self.assertFalse(payload["ok"])

    def test_codex_rejects_empty_prompt(self) -> None:
        status, payload = self.request(
            "/api/codex/task",
            payload={"prompt": "   ", "repoId": "watch"},
            token="secret-token",
        )
        self.assertEqual(status, 400)
        self.assertFalse(payload["ok"])
        self.assertEqual(payload["error"], "prompt is required")

    def test_codex_task_and_poll(self) -> None:
        status, created = self.request(
            "/api/codex/task",
            payload={"prompt": "检查", "repoId": "watch"},
            token="secret-token",
        )
        self.assertEqual(status, 200)
        self.assertEqual(created["taskId"], "task-1")
        time.sleep(0.2)
        status, polled = self.request("/api/codex/task/task-1", token="secret-token")
        self.assertEqual(status, 200)
        self.assertEqual(polled["status"], "succeeded")
        self.assertEqual(polled["finalText"], "完成")

    def test_health_reports_codex(self) -> None:
        status, payload = self.request("/health")
        self.assertEqual(status, 200)
        self.assertTrue(payload["codex"]["available"])


class ServiceRuntimeTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        import ai_service

        cls.ai_service = ai_service

    def test_parser_defaults_to_small_simplified_asr(self) -> None:
        with mock.patch.object(sys, "argv", ["ai_service.py"]):
            args = self.ai_service.parse_args()
        self.assertEqual(args.whisper_model, "small")
        self.assertTrue(args.warmup_asr)

    def test_transcribe_requests_simplified_chinese(self) -> None:
        artifacts = SCRIPT_DIR.parent / "artifacts"
        artifacts.mkdir(exist_ok=True)
        with tempfile.TemporaryDirectory(dir=artifacts) as temp:
            runtime = object.__new__(self.ai_service.Runtime)
            runtime.audio_dir = Path(temp)
            runtime.whisper_lock = threading.Lock()
            runtime.log = lambda **_payload: None
            runtime.args = SimpleNamespace(whisper_model="small")

            class FakeModel:
                device = SimpleNamespace(type="cpu")

                def __init__(self) -> None:
                    self.options: dict = {}

                def transcribe(self, _path: str, **options) -> dict:
                    self.options = options
                    return {"text": "检查当前仓库，默认语音后端是什么？"}

            model = FakeModel()
            runtime.whisper_model = model
            result = runtime.transcribe(b"\x00\x00" * 160)

        self.assertEqual(result["transcript"], "检查当前仓库，默认语音后端是什么？")
        self.assertEqual(model.options["language"], "zh")
        self.assertFalse(model.options["condition_on_previous_text"])
        self.assertIn("简体中文", model.options["initial_prompt"])


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--long",
        action="store_true",
        help="run the >60 second polling regression in addition to unit tests",
    )
    args, remaining = parser.parse_known_args()
    if args.long:
        suite = unittest.TestSuite()
        suite.addTest(unittest.defaultTestLoader.loadTestsFromTestCase(CodexBridgeTests))
        suite.addTest(unittest.defaultTestLoader.loadTestsFromTestCase(HttpRouteTests))
        result = unittest.TextTestRunner(verbosity=2).run(suite)
        if not result.wasSuccessful():
            raise SystemExit(1)
        run_long_poll()
        return
    unittest.main(argv=[sys.argv[0], *remaining])


def run_long_poll() -> None:
    with tempfile.TemporaryDirectory() as temp:
        root = Path(temp)
        repo = root / "repo"
        repo.mkdir()
        fake = root / "fake_codex.py"
        fake.write_text(FAKE_CODEX, encoding="utf-8")
        server, port = _open_backend()
        env = {
            "FAKE_CODEX_MODE": "long",
            "FAKE_CODEX_DURATION": "66",
            "FAKE_CODEX_ANSWER": "长任务完成。",
            "FAKE_CODEX_PROMPT_FILE": str(root / "prompt.txt"),
        }
        old = {key: os.environ.get(key) for key in env}
        os.environ.update(env)
        try:
            manager = CodexTaskManager(
                repo_allowlist={"watch": repo},
                model="fake-model",
                backend_url=f"http://127.0.0.1:{port}/v1",
                timeout_seconds=90,
                task_root=root / "tasks",
                codex_command=[sys.executable, str(fake)],
                log=lambda **payload: None,
            )
            task = manager.create(
                prompt="运行长任务",
                transcript="运行长任务",
                repo_id="watch",
                mode="readonly",
            )
            started = time.monotonic()
            observed_running_after_60 = False
            while time.monotonic() - started < 80:
                current = manager.get(task["taskId"])
                if current["status"] == "running" and time.monotonic() - started > 60:
                    observed_running_after_60 = True
                if current["status"] in ("succeeded", "failed", "cancelled"):
                    break
                time.sleep(1.5)
            if not observed_running_after_60:
                raise AssertionError("task did not remain pollable beyond 60 seconds")
            if current["status"] != "succeeded":
                raise AssertionError(f"long task ended as {current['status']}")
            print(json.dumps({"success": True, "longPollSeconds": round(time.monotonic() - started)}, ensure_ascii=False))
        finally:
            for key, value in old.items():
                if value is None:
                    os.environ.pop(key, None)
                else:
                    os.environ[key] = value
            server.shutdown()
            server.server_close()


if __name__ == "__main__":
    main()
