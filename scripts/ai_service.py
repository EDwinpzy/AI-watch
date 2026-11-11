#!/usr/bin/env python3
"""Local real-voice backend for NOVA Watch AI."""

from __future__ import annotations

import argparse
import base64
import binascii
import json
import os
import secrets
import shlex
import subprocess
import threading
import time
import uuid
import wave
from datetime import datetime, timezone
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from codex_bridge import CodexTaskManager, TaskBusyError, TaskNotFoundError

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_EVIDENCE = ROOT / "artifacts" / "ai-service" / "runtime"
DEFAULT_CODEX_TASKS = ROOT / "artifacts" / "codex-watch" / "tasks"
DEFAULT_CODEX_REPO = Path(os.environ.get("NOVA_CODEX_REPO", r"D:\MyProjects\AI-watch"))


def utc_now() -> str:
    return datetime.now(timezone.utc).astimezone(timezone.utc).isoformat(timespec="milliseconds")


def utc_stamp() -> str:
    return datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")


class Runtime:
    def __init__(self, args: argparse.Namespace) -> None:
        self.args = args
        self.evidence_dir = Path(args.evidence_dir).resolve()
        self.evidence_dir.mkdir(parents=True, exist_ok=True)
        self.event_log = self.evidence_dir / "service-events.jsonl"
        self.audio_dir = self.evidence_dir / "audio"
        self.audio_dir.mkdir(exist_ok=True)
        self.whisper_lock = threading.Lock()
        self.whisper_model = None
        self.codex = self._build_codex_manager()

    def _build_codex_manager(self) -> CodexTaskManager:
        repo_specs = self.args.codex_repo or [
            f"watch={self.args.codex_default_repo}"
        ]
        repos: dict[str, Path] = {}
        for spec in repo_specs:
            if "=" in spec:
                repo_id, raw_path = spec.split("=", 1)
            else:
                repo_id, raw_path = "watch", spec
            repo_id = repo_id.strip()
            raw_path = raw_path.strip()
            if not repo_id or not raw_path:
                raise ValueError("invalid --codex-repo value")
            repos[repo_id] = Path(raw_path).expanduser().resolve()
        command = shlex.split(self.args.codex_command, posix=False)
        if not command:
            raise ValueError("--codex-command cannot be empty")
        return CodexTaskManager(
            repo_allowlist=repos,
            model=self.args.codex_model,
            backend_url=self.args.codex_backend_url,
            timeout_seconds=self.args.codex_task_timeout,
            task_root=Path(self.args.codex_evidence_dir),
            codex_command=command,
            log=self.log,
            backend_timeout=self.args.codex_backend_timeout,
        )

    def log(self, **payload) -> None:
        row = {"timestamp": utc_now(), **payload}
        with self.event_log.open("a", encoding="utf-8") as f:
            f.write(json.dumps(row, ensure_ascii=False) + "\n")

    def whisper(self):
        if self.whisper_model is None:
            import torch
            import whisper

            device = "cuda" if torch.cuda.is_available() else "cpu"
            self.log(event="whisper_load_start", model=self.args.whisper_model, device=device)
            started = time.perf_counter()
            self.whisper_model = whisper.load_model(self.args.whisper_model, device=device)
            self.log(event="whisper_load_done", model=self.args.whisper_model, device=device,
                     elapsed_ms=round((time.perf_counter() - started) * 1000))
        return self.whisper_model

    def warmup_asr(self) -> None:
        started = time.perf_counter()
        self.whisper()
        self.log(event="whisper_warmup_done", model=self.args.whisper_model,
                 elapsed_ms=round((time.perf_counter() - started) * 1000))

    def write_wav(self, pcm: bytes, path: Path) -> None:
        with wave.open(str(path), "wb") as wav:
            wav.setnchannels(1)
            wav.setsampwidth(2)
            wav.setframerate(16000)
            wav.writeframes(pcm)

    def transcribe(self, pcm: bytes) -> dict:
        request_id = utc_stamp() + "-" + uuid.uuid4().hex[:8]
        wav_path = self.audio_dir / f"asr-input-{request_id}.wav"
        self.write_wav(pcm, wav_path)
        started = time.perf_counter()
        with self.whisper_lock:
            result = self.whisper().transcribe(
                str(wav_path), language="zh",
                fp16=self.whisper_model.device.type == "cuda",
                condition_on_previous_text=False,
                initial_prompt="以下是普通话的句子，请使用简体中文。",
            )
        elapsed_ms = round((time.perf_counter() - started) * 1000)
        text = (result.get("text") or "").strip()
        self.log(event="asr_done", requestId=request_id, audioBytes=len(pcm),
                 wavBytes=wav_path.stat().st_size, elapsedMs=elapsed_ms,
                 transcript=text, wavPath=str(wav_path.relative_to(ROOT)))
        return {"requestId": request_id, "transcript": text, "elapsedMs": elapsed_ms,
                "wavPath": str(wav_path.relative_to(ROOT))}

    def chat(self, prompt: str, model: str) -> dict:
        started = time.perf_counter()
        body = {
            "model": model,
            "system": "你是圆形手表上的中文智能助手。回答必须简短、自然，优先控制在 60 个汉字以内。",
            "prompt": prompt, "stream": False, "keep_alive": "30m",
            "options": {"temperature": 0.1, "num_predict": 48},
        }
        req = Request("http://127.0.0.1:11434/api/generate",
                      data=json.dumps(body, ensure_ascii=False).encode("utf-8"),
                      headers={"Content-Type": "application/json"}, method="POST")
        with urlopen(req, timeout=self.args.ollama_timeout) as response:
            payload = json.loads(response.read().decode("utf-8"))
        reply = (payload.get("response") or "").strip()
        elapsed_ms = round((time.perf_counter() - started) * 1000)
        self.log(event="model_done", model=payload.get("model", model), prompt=prompt,
                 reply=reply, elapsedMs=elapsed_ms, done=payload.get("done"))
        return {"model": payload.get("model", model), "reply": reply,
                "elapsedMs": elapsed_ms, "done": bool(payload.get("done"))}

    def synthesize(self, text: str) -> Path:
        started = time.perf_counter()
        request_id = utc_stamp() + "-" + uuid.uuid4().hex[:8]
        text_path = self.audio_dir / f"tts-text-{request_id}.txt"
        wav_path = self.audio_dir / f"tts-output-{request_id}.wav"
        text_path.write_text(text, encoding="utf-8")
        script = (
            "Add-Type -AssemblyName System.Speech; "
            "$s=New-Object System.Speech.Synthesis.SpeechSynthesizer; "
            "$zh=$s.GetInstalledVoices() | Where-Object {$_.VoiceInfo.Culture.Name -eq 'zh-CN'} | Select-Object -First 1; "
            "if($zh){$s.SelectVoice($zh.VoiceInfo.Name)}; $s.Rate=0; $s.Volume=100; "
            "$txt=[IO.File]::ReadAllText($env:NOVA_TTS_TEXT,[Text.Encoding]::UTF8); "
            "$s.SetOutputToWaveFile($env:NOVA_TTS_OUT); $s.Speak($txt); $s.Dispose()"
        )
        env = dict(os.environ)
        env["NOVA_TTS_TEXT"] = str(text_path)
        env["NOVA_TTS_OUT"] = str(wav_path)
        proc = subprocess.run(["powershell", "-NoProfile", "-NonInteractive",
                               "-ExecutionPolicy", "Bypass", "-Command", script],
                              capture_output=True, text=True, env=env,
                              timeout=self.args.tts_timeout)
        if proc.returncode != 0 or not wav_path.exists():
            raise RuntimeError(f"TTS failed: {proc.stderr or proc.stdout}")
        text_path.unlink(missing_ok=True)
        elapsed_ms = round((time.perf_counter() - started) * 1000)
        self.log(event="tts_done", text=text, elapsedMs=elapsed_ms,
                 wavBytes=wav_path.stat().st_size, wavPath=str(wav_path.relative_to(ROOT)))
        return wav_path


class Handler(BaseHTTPRequestHandler):
    runtime: Runtime

    def log_message(self, fmt: str, *args) -> None:
        self.runtime.log(event="http", client=self.client_address[0], message=fmt % args)

    def _client_allowed(self) -> bool:
        return self.client_address[0] in self.runtime.args.allow_client

    def _send_json(self, status: int, payload: dict) -> None:
        data = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(data)

    def _codex_authorized(self) -> bool:
        expected = self.runtime.args.codex_token
        if not expected:
            return True
        supplied = self.headers.get("X-Nova-Token", "")
        if not supplied:
            authorization = self.headers.get("Authorization", "")
            if authorization.lower().startswith("bearer "):
                supplied = authorization[7:]
        return secrets.compare_digest(supplied, expected)

    def _read_body(self) -> bytes:
        length = int(self.headers.get("Content-Length", "0"))
        if length < 0 or length > self.runtime.args.max_body_bytes:
            raise ValueError("request body too large")
        return self.rfile.read(length)

    def do_GET(self) -> None:
        if not self._client_allowed():
            self._send_json(HTTPStatus.FORBIDDEN, {"ok": False, "error": "client not allowed"})
            return
        if self.path == "/health":
            self._send_json(HTTPStatus.OK, {"ok": True, "model": self.runtime.args.model,
                "asr": self.runtime.args.whisper_model, "tts": "Windows SAPI zh-CN",
                "codex": self.runtime.codex.health(), "serverTime": utc_now()})
            return
        if self.path.startswith("/api/codex/task/"):
            if not self._codex_authorized():
                self._send_json(HTTPStatus.UNAUTHORIZED, {"ok": False, "error": "codex auth failed"})
                return
            task_id = self.path[len("/api/codex/task/") :].strip("/")
            try:
                task = self.runtime.codex.get(task_id)
            except TaskNotFoundError:
                self._send_json(HTTPStatus.NOT_FOUND, {"ok": False, "error": "task not found"})
                return
            self._send_json(HTTPStatus.OK, {"ok": True, **task})
            return
        if self.path.startswith("/api/audio/") and self.path.endswith(".wav"):
            name = Path(self.path).name
            wav = self.runtime.audio_dir / name
            if not wav.exists():
                self._send_json(HTTPStatus.NOT_FOUND, {"ok": False, "error": "audio not found"})
                return
            data = wav.read_bytes()
            self.send_response(HTTPStatus.OK)
            self.send_header("Content-Type", "audio/wav")
            self.send_header("Content-Length", str(len(data)))
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            self.wfile.write(data)
            return
        self._send_json(HTTPStatus.NOT_FOUND, {"ok": False, "error": "not found"})

    def do_POST(self) -> None:
        if not self._client_allowed():
            self._send_json(HTTPStatus.FORBIDDEN, {"ok": False, "error": "client not allowed"})
            return
        try:
            body = self._read_body()
            if self.path == "/api/chat":
                payload = json.loads(body.decode("utf-8"))
                prompt = str(payload.get("prompt") or "").strip()
                if not prompt:
                    raise ValueError("prompt is required")
                result = self.runtime.chat(prompt, str(payload.get("model") or self.runtime.args.model))
                self._send_json(HTTPStatus.OK, {"ok": True, **result})
                return
            if self.path == "/api/asr":
                if not body:
                    raise ValueError("PCM body is required")
                result = self.runtime.transcribe(body)
                self._send_json(HTTPStatus.OK, {"ok": True, **result})
                return
            if self.path == "/api/tts":
                payload = json.loads(body.decode("utf-8"))
                text = str(payload.get("text") or "").strip()
                if not text:
                    raise ValueError("text is required")
                wav = self.runtime.synthesize(text)
                self._send_json(HTTPStatus.OK, {"ok": True,
                    "audioUrl": f"/api/audio/{wav.name}", "bytes": wav.stat().st_size})
                return
            if self.path == "/api/voice":
                if not body:
                    raise ValueError("voice body is required")
                model = self.headers.get("X-Nova-Model") or self.runtime.args.model
                if "application/json" in (self.headers.get("Content-Type") or ""):
                    payload = json.loads(body.decode("utf-8"))
                    encoded = str(payload.get("pcmBase64") or "")
                    if not encoded:
                        raise ValueError("pcmBase64 is required")
                    pcm = base64.b64decode(encoded)
                    model = str(payload.get("model") or model)
                else:
                    pcm = body
                pipeline_started = time.perf_counter()
                asr = self.runtime.transcribe(pcm)
                chat = self.runtime.chat(asr["transcript"], model)
                tts = self.runtime.synthesize(chat["reply"])
                total_ms = round((time.perf_counter() - pipeline_started) * 1000)
                self.runtime.log(event="voice_pipeline_done", requestId=asr["requestId"],
                                 totalMs=total_ms, transcript=asr["transcript"], reply=chat["reply"])
                self._send_json(HTTPStatus.OK, {"ok": True,
                    "transcript": asr["transcript"], "reply": chat["reply"],
                    "model": chat["model"], "audioUrl": f"/api/audio/{tts.name}",
                    "timings": {"asrMs": asr["elapsedMs"], "modelMs": chat["elapsedMs"],
                                "totalMs": total_ms}})
                return
            if self.path.startswith("/api/codex/"):
                if not self._codex_authorized():
                    self._send_json(HTTPStatus.UNAUTHORIZED, {"ok": False, "error": "codex auth failed"})
                    return
                if self.path == "/api/codex/voice":
                    payload = json.loads(body.decode("utf-8"))
                    encoded = str(payload.get("pcmBase64") or "")
                    if not encoded:
                        raise ValueError("pcmBase64 is required")
                    try:
                        pcm = base64.b64decode(encoded, validate=True)
                    except (binascii.Error, ValueError) as exc:
                        raise ValueError("pcmBase64 is invalid") from exc
                    if not pcm:
                        raise ValueError("PCM body is required")
                    sample_rate = int(payload.get("sampleRate") or 16000)
                    if sample_rate != 16000:
                        raise ValueError("sampleRate must be 16000")
                    transcript = self.runtime.transcribe(pcm)["transcript"]
                    task = self.runtime.codex.create(
                        prompt=transcript,
                        transcript=transcript,
                        repo_id=str(payload.get("repoId") or "watch"),
                        mode=str(payload.get("mode") or "readonly"),
                    )
                    self._send_json(HTTPStatus.OK, {
                        "ok": True,
                        "taskId": task["taskId"],
                        "transcript": task["transcript"],
                        "status": task["status"],
                    })
                    return
                if self.path == "/api/codex/task":
                    payload = json.loads(body.decode("utf-8"))
                    prompt = str(payload.get("prompt") or "").strip()
                    task = self.runtime.codex.create(
                        prompt=prompt,
                        transcript=str(payload.get("transcript") or prompt).strip(),
                        repo_id=str(payload.get("repoId") or "watch"),
                        mode=str(payload.get("mode") or "readonly"),
                    )
                    self._send_json(HTTPStatus.OK, {
                        "ok": True,
                        "taskId": task["taskId"],
                        "status": task["status"],
                    })
                    return
                if self.path.startswith("/api/codex/task/") and self.path.endswith("/cancel"):
                    task_id = self.path[len("/api/codex/task/") : -len("/cancel")].strip("/")
                    try:
                        task = self.runtime.codex.cancel(task_id)
                    except TaskNotFoundError:
                        self._send_json(HTTPStatus.NOT_FOUND, {"ok": False, "error": "task not found"})
                        return
                    self._send_json(HTTPStatus.OK, {
                        "ok": True,
                        "taskId": task["taskId"],
                        "status": task["status"],
                    })
                    return
            self._send_json(HTTPStatus.NOT_FOUND, {"ok": False, "error": "not found"})
        except (ValueError, json.JSONDecodeError) as exc:
            self._send_json(HTTPStatus.BAD_REQUEST, {"ok": False, "error": str(exc)})
        except TaskBusyError as exc:
            self._send_json(HTTPStatus.CONFLICT, {"ok": False, "error": str(exc)})
        except (HTTPError, URLError, TimeoutError, subprocess.TimeoutExpired, RuntimeError) as exc:
            self.runtime.log(event="request_error", path=self.path, error=str(exc))
            self._send_json(HTTPStatus.BAD_GATEWAY, {"ok": False, "error": str(exc)})
        except Exception as exc:
            self.runtime.log(event="request_error", path=self.path, error=repr(exc))
            self._send_json(HTTPStatus.INTERNAL_SERVER_ERROR, {"ok": False, "error": repr(exc)})


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8787)
    parser.add_argument("--model", default="translategemma:4b")
    parser.add_argument("--whisper-model", default="small")
    parser.add_argument("--allow-client", action="append", default=[])
    parser.add_argument("--evidence-dir", default=str(DEFAULT_EVIDENCE))
    parser.add_argument("--max-body-bytes", type=int, default=4 * 1024 * 1024)
    parser.add_argument("--ollama-timeout", type=int, default=180)
    parser.add_argument("--tts-timeout", type=int, default=30)
    parser.add_argument("--codex-default-repo", default=str(DEFAULT_CODEX_REPO))
    parser.add_argument("--codex-repo", action="append", default=[])
    parser.add_argument(
        "--codex-model",
        default="commandcode-plan/deepseek/deepseek-v4.1-flash",
    )
    parser.add_argument("--codex-backend-url", default="http://127.0.0.1:3425/v1")
    parser.add_argument("--codex-task-timeout", type=int, default=600)
    parser.add_argument("--codex-command", default="codex")
    parser.add_argument("--codex-token", default=os.environ.get("NOVA_CODEX_TOKEN", ""))
    parser.add_argument("--codex-evidence-dir", default=str(DEFAULT_CODEX_TASKS))
    parser.add_argument("--codex-backend-timeout", type=float, default=2.0)
    parser.add_argument("--no-warmup", action="store_false", dest="warmup", default=True)
    parser.add_argument("--warmup-asr", action="store_true", dest="warmup_asr", default=True)
    parser.add_argument("--no-warmup-asr", action="store_false", dest="warmup_asr")
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    if not args.allow_client:
        args.allow_client = ["127.0.0.1", "::1"]
    if not args.codex_token:
        args.codex_token = secrets.token_urlsafe(18)
    runtime = Runtime(args)
    Handler.runtime = runtime
    if args.warmup_asr:
        try:
            runtime.warmup_asr()
        except Exception as exc:
            runtime.log(event="warmup_error", component="asr", error=str(exc))
    if args.warmup:
        try:
            runtime.chat('你好', args.model)
        except Exception as exc:
            runtime.log(event='warmup_error', error=str(exc))
    server = ThreadingHTTPServer((args.host, args.port), Handler)
    runtime.log(event="service_start", host=args.host, port=args.port, allowClient=args.allow_client)
    print(json.dumps({"ready": True, "host": args.host, "port": args.port,
                      "allowClient": args.allow_client,
                      "codexToken": args.codex_token}), flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
        runtime.log(event="service_stop")


if __name__ == "__main__":
    main()
