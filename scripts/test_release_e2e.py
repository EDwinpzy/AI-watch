#!/usr/bin/env python3
"""Release smoke test for the running NOVA AI service."""

from __future__ import annotations

import argparse
import base64
import json
import os
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path


def request_json(
    base_url: str,
    path: str,
    *,
    token: str = "",
    payload: dict | None = None,
    timeout: float = 15,
) -> tuple[int, dict]:
    headers = {"Content-Type": "application/json"}
    if token:
        headers["X-Nova-Token"] = token
    data = None if payload is None else json.dumps(payload, ensure_ascii=False).encode("utf-8")
    request = urllib.request.Request(
        base_url.rstrip("/") + path,
        data=data,
        headers=headers,
        method="GET" if payload is None else "POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            return response.status, json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        return exc.code, json.loads(exc.read().decode("utf-8"))


def poll_task(
    base_url: str,
    token: str,
    task_id: str,
    timeout_seconds: float,
) -> tuple[dict, list[dict], float]:
    started = time.monotonic()
    polls: list[dict] = []
    previous = None
    while time.monotonic() - started < timeout_seconds:
        status, current = request_json(
            base_url,
            f"/api/codex/task/{task_id}",
            token=token,
        )
        if status != 200:
            raise RuntimeError(f"poll failed: HTTP {status} {current}")
        marker = (
            current.get("status"),
            current.get("stage"),
            current.get("elapsedMs"),
        )
        if marker != previous:
            polls.append(
                {
                    "status": current.get("status", ""),
                    "stage": current.get("stage", ""),
                    "elapsedMs": current.get("elapsedMs", 0),
                }
            )
            previous = marker
        if current.get("status") in ("succeeded", "failed", "cancelled"):
            return current, polls, round(time.monotonic() - started, 2)
        time.sleep(1.5)
    raise TimeoutError(f"task {task_id} did not reach a terminal state")


def assert_task_result(result: dict, expected_status: str) -> None:
    if result.get("status") != expected_status:
        raise AssertionError(f"unexpected task state: {result}")
    if result.get("audioUrl") != "":
        raise AssertionError(f"audioUrl must stay empty: {result.get('audioUrl')}")
    if expected_status == "succeeded":
        if not str(result.get("finalText") or "").strip():
            raise AssertionError("successful task has no finalText")
        speech_text = str(result.get("speechText") or "")
        if not speech_text or len(speech_text) > 120:
            raise AssertionError("speechText must contain 1-120 characters")


def run_text_task(base_url: str, token: str, repo_id: str, timeout_seconds: float) -> dict:
    prompt = (
        "只读检查当前仓库的正式入口、默认语音后端和主要页面，"
        "先给一句结论，再给最多三条要点，总长不超过120个汉字。"
    )
    status, created = request_json(
        base_url,
        "/api/codex/task",
        token=token,
        payload={
            "prompt": prompt,
            "transcript": "只读检查当前仓库的正式入口和默认语音后端",
            "repoId": repo_id,
            "mode": "readonly",
        },
    )
    if status != 200:
        raise AssertionError(f"text task create failed: HTTP {status} {created}")
    result, polls, wall_seconds = poll_task(
        base_url,
        token,
        created["taskId"],
        timeout_seconds,
    )
    assert_task_result(result, "succeeded")
    return {
        "taskId": created["taskId"],
        "createStatus": status,
        "wallSeconds": wall_seconds,
        "polls": polls,
        "result": result,
        "longPollObserved": wall_seconds > 60,
    }


def run_cancel_task(base_url: str, token: str, repo_id: str) -> dict:
    status, first = request_json(
        base_url,
        "/api/codex/task",
        token=token,
        payload={
            "prompt": "只读检查当前仓库所有主要源码文件，再给三个风险点，不要修改文件。",
            "transcript": "只读检查当前仓库所有主要源码文件",
            "repoId": repo_id,
            "mode": "readonly",
        },
    )
    if status != 200:
        raise AssertionError(f"cancel fixture create failed: HTTP {status} {first}")

    busy_status, busy = request_json(
        base_url,
        "/api/codex/task",
        token=token,
        payload={
            "prompt": "第二个并发任务",
            "transcript": "第二个并发任务",
            "repoId": repo_id,
            "mode": "readonly",
        },
    )
    if busy_status != 409:
        raise AssertionError(f"concurrency guard failed: HTTP {busy_status} {busy}")

    time.sleep(2)
    cancel_status, cancelled = request_json(
        base_url,
        f"/api/codex/task/{first['taskId']}/cancel",
        token=token,
        payload={},
    )
    if cancel_status != 200:
        raise AssertionError(f"cancel failed: HTTP {cancel_status} {cancelled}")

    result, polls, wall_seconds = poll_task(base_url, token, first["taskId"], 30)
    assert_task_result(result, "cancelled")
    return {
        "taskId": first["taskId"],
        "concurrencyStatus": busy_status,
        "cancelStatus": cancel_status,
        "wallSeconds": wall_seconds,
        "polls": polls,
        "result": result,
    }


def run_voice_task(
    base_url: str,
    token: str,
    repo_id: str,
    pcm_path: Path,
    timeout_seconds: float,
    max_create_seconds: float,
) -> dict:
    pcm = pcm_path.read_bytes()
    if not pcm:
        raise AssertionError(f"voice PCM is empty: {pcm_path}")
    started = time.monotonic()
    status, created = request_json(
        base_url,
        "/api/codex/voice",
        token=token,
        payload={
            "pcmBase64": base64.b64encode(pcm).decode("ascii"),
            "sampleRate": 16000,
            "repoId": repo_id,
            "mode": "readonly",
        },
        timeout=180,
    )
    create_seconds = round(time.monotonic() - started, 2)
    if status != 200:
        raise AssertionError(f"voice task create failed: HTTP {status} {created}")
    if not str(created.get("transcript") or "").strip():
        raise AssertionError(f"voice transcript is empty: {created}")
    if create_seconds > max_create_seconds:
        raise AssertionError(
            f"voice task creation took {create_seconds}s, expected <= {max_create_seconds}s"
        )
    result, polls, wall_seconds = poll_task(
        base_url,
        token,
        created["taskId"],
        timeout_seconds,
    )
    assert_task_result(result, "succeeded")
    return {
        "taskId": created["taskId"],
        "pcmBytes": len(pcm),
        "createSeconds": create_seconds,
        "created": created,
        "wallSeconds": wall_seconds,
        "polls": polls,
        "result": result,
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--base-url", default="http://127.0.0.1:8787")
    parser.add_argument("--token", default=os.environ.get("NOVA_TEST_TOKEN", ""))
    parser.add_argument("--repo-id", default="watch")
    parser.add_argument("--voice-pcm", type=Path)
    parser.add_argument("--timeout", type=float, default=300)
    parser.add_argument("--max-voice-create-seconds", type=float, default=3.0)
    parser.add_argument("--require-long-poll", action="store_true")
    parser.add_argument(
        "--output",
        type=Path,
        default=Path("artifacts/release-v1.2.1/e2e/release-e2e.json"),
    )
    args = parser.parse_args()
    if not args.token:
        parser.error("--token or NOVA_TEST_TOKEN is required")

    health_status, health = request_json(args.base_url, "/health", timeout=10)
    if health_status != 200 or not health.get("ok"):
        raise AssertionError(f"health failed: HTTP {health_status} {health}")
    if not health.get("codex", {}).get("available"):
        raise AssertionError(f"Codex backend unavailable: {health}")

    auth_status, auth_payload = request_json(
        args.base_url,
        "/api/codex/task",
        payload={"prompt": "auth probe", "repoId": args.repo_id},
    )
    if auth_status != 401:
        raise AssertionError(f"auth guard failed: HTTP {auth_status} {auth_payload}")

    text = run_text_task(args.base_url, args.token, args.repo_id, args.timeout)
    cancel = run_cancel_task(args.base_url, args.token, args.repo_id)
    voice = None
    if args.voice_pcm:
        voice = run_voice_task(
            args.base_url,
            args.token,
            args.repo_id,
            args.voice_pcm,
            args.timeout,
            args.max_voice_create_seconds,
        )

    if args.require_long_poll and not text["longPollObserved"]:
        raise AssertionError(
            f"text task completed before 60 seconds ({text['wallSeconds']}s)"
        )

    report = {
        "success": True,
        "baseUrl": args.base_url,
        "repoId": args.repo_id,
        "health": health,
        "authStatus": auth_status,
        "text": text,
        "cancel": cancel,
        "voice": voice,
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(
        json.dumps(report, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    print(
        json.dumps(
            {
                "success": True,
                "textSeconds": text["wallSeconds"],
                "longPollObserved": text["longPollObserved"],
                "concurrencyStatus": cancel["concurrencyStatus"],
                "cancelStatus": cancel["result"]["status"],
                "voiceCreateSeconds": voice["createSeconds"] if voice else None,
                "voiceTranscript": voice["created"]["transcript"] if voice else None,
                "output": str(args.output),
            },
            ensure_ascii=False,
        )
    )


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print(json.dumps({"success": False, "error": str(exc)}, ensure_ascii=False))
        raise SystemExit(1)
