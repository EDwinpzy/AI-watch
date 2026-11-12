"""Read-only Codex task bridge for NOVA Watch AI."""

from __future__ import annotations

import json
import os
import queue
import re
import socket
import subprocess
import threading
import time
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Callable
from urllib.parse import urlparse


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="milliseconds")


def _iso_elapsed_ms(started_at: str, ended_at: str | None = None) -> int:
    start = datetime.fromisoformat(started_at)
    end = datetime.fromisoformat(ended_at) if ended_at else datetime.now(timezone.utc)
    return max(0, round((end - start).total_seconds() * 1000))


def compact_speech_text(text: str, limit: int = 120) -> str:
    """Turn a Markdown-heavy Codex answer into a short spoken sentence."""
    source = re.sub(r"```.*?```", " ", text, flags=re.DOTALL)
    source = re.sub(r"`([^`]+)`", r"\1", source)
    source = re.sub(r"!\[[^\]]*\]\([^)]*\)", " ", source)
    source = re.sub(r"\[([^\]]+)\]\([^)]*\)", r"\1", source)
    lines = []
    for raw in source.splitlines():
        line = re.sub(r"^\s*(?:#{1,6}|[-*+]|\d+[.)])\s*", "", raw).strip()
        if line and not line.startswith("|"):
            lines.append(line)
    clean = re.sub(r"\s+", " ", " ".join(lines)).strip()
    if len(clean) <= limit:
        return clean
    for index in range(limit, max(30, limit // 3), -1):
        if clean[index - 1] in "。！？；":
            return clean[:index]
    return clean[: limit - 1].rstrip("，、；：,;: ") + "…"


class TaskBusyError(RuntimeError):
    pass


class BackendUnavailableError(RuntimeError):
    pass


class TaskNotFoundError(KeyError):
    pass


@dataclass
class TaskRecord:
    task_id: str
    prompt: str
    transcript: str
    repo_id: str
    repo_path: Path
    mode: str
    status: str = "queued"
    stage: str = "已排队"
    message: str = "等待 Codex 执行"
    final_text: str = ""
    speech_text: str = ""
    audio_url: str = ""
    error: str = ""
    created_at: str = field(default_factory=_utc_now)
    started_at: str = ""
    completed_at: str = ""
    cancel_requested: bool = False
    pid: int | None = None

    def public(self) -> dict:
        return {
            "taskId": self.task_id,
            "repoId": self.repo_id,
            "mode": self.mode,
            "status": self.status,
            "stage": self.stage,
            "transcript": self.transcript,
            "message": self.message,
            "finalText": self.final_text,
            "speechText": self.speech_text,
            "audioUrl": self.audio_url,
            "elapsedMs": _iso_elapsed_ms(self.created_at, self.completed_at or None),
            "error": self.error,
            "createdAt": self.created_at,
            "completedAt": self.completed_at,
        }


@dataclass
class RunResult:
    final_text: str
    cancelled: bool = False
    error: str = ""
    elapsed_ms: int = 0


class CodexRunner:
    def __init__(
        self,
        *,
        model: str,
        backend_url: str,
        timeout_seconds: int,
        task_root: Path,
        codex_command: list[str],
        stage_callback: Callable[[str, str], None],
        cancel_callback: Callable[[], bool],
        backend_timeout: float = 2.0,
    ) -> None:
        self.model = model
        self.backend_url = backend_url.rstrip("/")
        self.timeout_seconds = timeout_seconds
        self.task_root = task_root
        self.codex_command = codex_command
        self.stage_callback = stage_callback
        self.cancel_callback = cancel_callback
        self.backend_timeout = backend_timeout

    def backend_available(self) -> bool:
        parsed = urlparse(self.backend_url)
        host = parsed.hostname or "127.0.0.1"
        port = parsed.port or (443 if parsed.scheme == "https" else 80)
        try:
            with socket.create_connection((host, port), timeout=self.backend_timeout):
                return True
        except OSError:
            return False

    def _provider_args(self) -> list[str]:
        return [
            "-c",
            'model_provider="magpie"',
            "-c",
            'model_providers.magpie.name="magpie"',
            "-c",
            f'model_providers.magpie.base_url="{self.backend_url}"',
            "-c",
            'model_providers.magpie.wire_api="responses"',
            "-c",
            'model_providers.magpie.experimental_bearer_token="magpie"',
            "-c",
            "model_providers.magpie.requires_openai_auth=true",
        ]

    def _command(self, repo_path: Path, last_message_path: Path) -> list[str]:
        return [
            *self.codex_command,
            "exec",
            "--json",
            "--ephemeral",
            "--sandbox",
            "read-only",
            "-C",
            str(repo_path),
            "-m",
            self.model,
            "-o",
            str(last_message_path),
            *self._provider_args(),
            "-",
        ]

    @staticmethod
    def _child_environment() -> dict[str, str]:
        environment = os.environ.copy()
        # The desktop app marks its own child processes as registered Core
        # launches. A nested codex exec cannot reuse that sandbox registration
        # and fails every command with "requires an installed app".
        environment.pop("CODEX_WINDOWS_REGISTERED_CORE", None)
        environment.pop("CODEX_WINDOWS_SANDBOX_PACKAGE_FAMILY", None)
        return environment

    def _spawn(self, args: list[str]) -> subprocess.Popen:
        options = {
            "stdin": subprocess.PIPE,
            "stdout": subprocess.PIPE,
            "stderr": subprocess.STDOUT,
            "text": True,
            "encoding": "utf-8",
            "errors": "replace",
            "bufsize": 1,
            "env": self._child_environment(),
        }
        if os.name == "nt":
            options["creationflags"] = subprocess.CREATE_NEW_PROCESS_GROUP
        else:
            options["start_new_session"] = True

        executable = self.codex_command[0] if self.codex_command else ""
        if os.name == "nt" and executable.lower().endswith((".cmd", ".bat")):
            command_line = subprocess.list2cmdline(args)
            comspec = os.environ.get("COMSPEC", "cmd.exe")
            return subprocess.Popen([comspec, "/d", "/s", "/c", command_line], **options)
        return subprocess.Popen(args, **options)

    def _kill_tree(self, pid: int) -> None:
        if os.name == "nt":
            subprocess.run(
                ["taskkill", "/PID", str(pid), "/T", "/F"],
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
                check=False,
            )
            return
        try:
            os.killpg(pid, 9)
        except OSError:
            pass

    @staticmethod
    def _short_error(lines: list[str]) -> str:
        for line in reversed(lines):
            value = line.strip()
            if value and not value.startswith("{") and "error" in value.lower():
                return value[-180:]
        return "Codex 执行失败"

    def run(self, task: TaskRecord, prompt: str) -> RunResult:
        started = time.perf_counter()
        if not self.backend_available():
            return RunResult(final_text="", error="Codex 后端不可用")

        wrapped_prompt = (
            "你是运行在圆形手表上的只读代码助手。只分析和解释指定仓库，"
            "不得修改文件，不执行安装、发布、删除或联网操作。"
            "用中文回答：先给一句结论，再给最多三条要点，总长不超过 120 个汉字。"
            "不要输出代码块、链接或 Markdown 表格。\n\n"
            f"用户问题：{prompt}"
        )
        task_dir = self.task_root / task.task_id
        task_dir.mkdir(parents=True, exist_ok=True)
        event_log = task_dir / "events.jsonl"
        last_message = task_dir / "last-message.txt"

        def log_event(payload: dict) -> None:
            row = {"timestamp": _utc_now(), **payload}
            with event_log.open("a", encoding="utf-8") as handle:
                handle.write(json.dumps(row, ensure_ascii=False) + "\n")

        log_event(
            {
                "event": "task_start",
                "repoId": task.repo_id,
                "mode": task.mode,
                "promptChars": len(prompt),
            }
        )
        args = self._command(task.repo_path, last_message)
        lines: list[str] = []
        last_agent_message = ""
        deadline = time.monotonic() + self.timeout_seconds

        try:
            process = self._spawn(args)
            task.pid = process.pid
            log_event({"event": "process_started", "pid": process.pid})
            assert process.stdin is not None
            process.stdin.write(wrapped_prompt)
            process.stdin.close()

            output_queue: queue.Queue[str | None] = queue.Queue()

            def read_output() -> None:
                assert process.stdout is not None
                try:
                    for line in process.stdout:
                        output_queue.put(line)
                finally:
                    output_queue.put(None)

            reader = threading.Thread(target=read_output, daemon=True)
            reader.start()
            stream_done = False
            cancelled = False
            timed_out = False

            while True:
                if self.cancel_callback():
                    cancelled = True
                    self._kill_tree(process.pid)
                    break
                if time.monotonic() >= deadline:
                    timed_out = True
                    self._kill_tree(process.pid)
                    break
                try:
                    line = output_queue.get(timeout=0.2)
                except queue.Empty:
                    if process.poll() is not None and stream_done:
                        break
                    continue
                if line is None:
                    stream_done = True
                    if process.poll() is not None:
                        break
                    continue

                value = line.strip()
                if value:
                    lines.append(value)
                if not value.startswith("{"):
                    continue
                try:
                    event = json.loads(value)
                except json.JSONDecodeError:
                    continue
                item = event.get("item") or {}
                item_type = item.get("type") or ""
                if item_type:
                    log_event(
                        {
                            "event": "item",
                            "phase": event.get("type", ""),
                            "itemType": item_type,
                            "status": item.get("status", ""),
                            "textChars": len(item.get("text") or ""),
                        }
                    )
                if event.get("type") == "turn.completed":
                    self.stage_callback("正在整理", "Codex 已完成分析")
                elif item_type == "agent_message" and item.get("text"):
                    last_agent_message = str(item["text"]).strip()
                    self.stage_callback("正在整理", "正在压缩语音回答")
                elif item_type == "command_execution":
                    self.stage_callback("正在检查仓库", "读取文件与运行只读命令")
                elif item_type in ("file_change", "patch_apply"):
                    self.stage_callback("正在核对变更", "只读模式不会写入文件")
                elif item_type == "mcp_tool_call":
                    self.stage_callback("正在调用工具", "等待只读工具结果")
                elif item_type in ("reasoning", "reasoning_summary"):
                    self.stage_callback("正在分析", "Codex 正在理解你的问题")

            try:
                process.wait(timeout=3)
            except subprocess.TimeoutExpired:
                self._kill_tree(process.pid)
                process.wait(timeout=3)
            reader.join(timeout=1)
            if process.stdout is not None:
                process.stdout.close()
            elapsed_ms = round((time.perf_counter() - started) * 1000)

            if cancelled:
                log_event({"event": "task_cancelled", "elapsedMs": elapsed_ms})
                return RunResult(final_text=last_agent_message, cancelled=True, elapsed_ms=elapsed_ms)
            if timed_out:
                log_event({"event": "task_timeout", "elapsedMs": elapsed_ms})
                return RunResult(
                    final_text=last_agent_message,
                    error=f"任务超过 {self.timeout_seconds // 60} 分钟",
                    elapsed_ms=elapsed_ms,
                )

            final_text = last_agent_message
            if last_message.exists():
                final_text = last_message.read_text(encoding="utf-8").strip() or final_text
            if process.returncode != 0:
                error = self._short_error(lines)
                log_event({"event": "task_failed", "returnCode": process.returncode, "elapsedMs": elapsed_ms})
                return RunResult(final_text=final_text, error=error, elapsed_ms=elapsed_ms)
            if not final_text:
                log_event({"event": "task_failed", "error": "empty_final_message", "elapsedMs": elapsed_ms})
                return RunResult(final_text="", error="Codex 未返回结果", elapsed_ms=elapsed_ms)
            log_event({"event": "task_succeeded", "elapsedMs": elapsed_ms, "resultChars": len(final_text)})
            return RunResult(final_text=final_text, elapsed_ms=elapsed_ms)
        except Exception as exc:
            elapsed_ms = round((time.perf_counter() - started) * 1000)
            log_event({"event": "runner_error", "errorType": type(exc).__name__, "elapsedMs": elapsed_ms})
            return RunResult(final_text="", error="Codex 启动失败", elapsed_ms=elapsed_ms)


class CodexTaskManager:
    def __init__(
        self,
        *,
        repo_allowlist: dict[str, Path],
        model: str,
        backend_url: str,
        timeout_seconds: int,
        task_root: Path,
        codex_command: list[str],
        log: Callable[..., None],
        backend_timeout: float = 2.0,
    ) -> None:
        self.repo_allowlist = {
            key: value.resolve() for key, value in repo_allowlist.items()
        }
        self.model = model
        self.backend_url = backend_url
        self.timeout_seconds = timeout_seconds
        self.task_root = task_root.resolve()
        self.task_root.mkdir(parents=True, exist_ok=True)
        self.codex_command = codex_command
        self.log = log
        self.backend_timeout = backend_timeout
        self._lock = threading.Lock()
        self._tasks: dict[str, TaskRecord] = {}
        self._active_task_id: str | None = None

    def backend_available(self) -> bool:
        runner = CodexRunner(
            model=self.model,
            backend_url=self.backend_url,
            timeout_seconds=self.timeout_seconds,
            task_root=self.task_root,
            codex_command=self.codex_command,
            stage_callback=lambda _stage, _message: None,
            cancel_callback=lambda: False,
            backend_timeout=self.backend_timeout,
        )
        return runner.backend_available()

    def health(self) -> dict:
        with self._lock:
            active_task_id = self._active_task_id
        return {
            "backend": "magpie",
            "model": self.model,
            "repoIds": sorted(self.repo_allowlist),
            "busy": active_task_id is not None,
            "activeTaskId": active_task_id or "",
            "available": self.backend_available(),
        }

    def _update(self, task_id: str, **fields) -> None:
        with self._lock:
            task = self._tasks[task_id]
            for key, value in fields.items():
                setattr(task, key, value)

    def _finish(self, task_id: str, status: str, **fields) -> None:
        with self._lock:
            task = self._tasks[task_id]
            for key, value in fields.items():
                setattr(task, key, value)
            task.status = status
            task.completed_at = _utc_now()
            if self._active_task_id == task_id:
                self._active_task_id = None

    def create(
        self,
        *,
        prompt: str,
        transcript: str,
        repo_id: str,
        mode: str,
    ) -> dict:
        prompt = prompt.strip()
        if not prompt:
            raise ValueError("prompt is required")
        if len(prompt) > 4000:
            raise ValueError("prompt is too long")
        if mode != "readonly":
            raise ValueError("only readonly mode is supported")
        repo = self.repo_allowlist.get(repo_id)
        if repo is None or not repo.is_dir():
            raise ValueError("repoId is not allowed")

        task_id = uuid.uuid4().hex
        with self._lock:
            if self._active_task_id is not None:
                raise TaskBusyError("已有 Codex 任务正在执行")
            task = TaskRecord(
                task_id=task_id,
                prompt=prompt,
                transcript=transcript,
                repo_id=repo_id,
                repo_path=repo,
                mode=mode,
            )
            self._tasks[task_id] = task
            self._active_task_id = task_id

        self.log(
            event="codex_task_created",
            taskId=task_id,
            repoId=repo_id,
            promptChars=len(prompt),
            transcriptChars=len(transcript),
        )
        thread = threading.Thread(
            target=self._run,
            args=(task_id,),
            name=f"codex-task-{task_id[:8]}",
            daemon=True,
        )
        thread.start()
        return task.public()

    def _run(self, task_id: str) -> None:
        with self._lock:
            task = self._tasks[task_id]
            prompt = task.prompt
            repo_path = task.repo_path

        self._update(
            task_id,
            status="running",
            stage="正在连接",
            message="Codex 正在连接本机后端",
            started_at=_utc_now(),
        )

        runner = CodexRunner(
            model=self.model,
            backend_url=self.backend_url,
            timeout_seconds=self.timeout_seconds,
            task_root=self.task_root,
            codex_command=self.codex_command,
            stage_callback=lambda stage, message: self._update(
                task_id, stage=stage, message=message
            ),
            cancel_callback=lambda: self._is_cancel_requested(task_id),
            backend_timeout=self.backend_timeout,
        )
        if not repo_path.is_dir():
            self._finish(task_id, "failed", stage="失败", message="仓库不可用", error="仓库不可用")
            return

        result = runner.run(task, prompt)
        if result.cancelled:
            self._finish(
                task_id,
                "cancelled",
                stage="已停止",
                message="任务已停止",
                final_text=result.final_text,
                speech_text=compact_speech_text(result.final_text) if result.final_text else "",
                error="",
            )
            self.log(event="codex_task_finished", taskId=task_id, status="cancelled")
            return
        if result.error:
            self._finish(
                task_id,
                "failed",
                stage="失败",
                message=result.error,
                final_text=result.final_text,
                speech_text=compact_speech_text(result.final_text) if result.final_text else "",
                error=result.error,
            )
            self.log(
                event="codex_task_finished",
                taskId=task_id,
                status="failed",
                error=result.error,
            )
            return

        speech_text = compact_speech_text(result.final_text)
        self._finish(
            task_id,
            "succeeded",
            stage="完成",
            message="Codex 已返回结果",
            final_text=result.final_text,
            speech_text=speech_text,
            audio_url="",
            error="",
        )
        self.log(event="codex_task_finished", taskId=task_id, status="succeeded")

    def _is_cancel_requested(self, task_id: str) -> bool:
        with self._lock:
            task = self._tasks.get(task_id)
            return bool(task and task.cancel_requested)

    def get(self, task_id: str) -> dict:
        with self._lock:
            task = self._tasks.get(task_id)
            if task is None:
                raise TaskNotFoundError(task_id)
            return task.public()

    def cancel(self, task_id: str) -> dict:
        with self._lock:
            task = self._tasks.get(task_id)
            if task is None:
                raise TaskNotFoundError(task_id)
            if task.status in ("succeeded", "failed", "cancelled"):
                return task.public()
            task.cancel_requested = True
            task.stage = "正在停止"
            task.message = "正在结束 Codex 子进程"
            return task.public()
