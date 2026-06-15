import json
import os
import time
from pathlib import Path
from urllib import error, request

import dashscope
from dashscope.utils.oss_utils import OssUtils
from flask import current_app


class ASRError(RuntimeError):
    pass


def transcribe_file(file_path, language="zh"):
    provider = current_app.config["ASR_PROVIDER"]
    if provider == "mock":
        return [
            {
                "start_time": 0,
                "end_time": 2,
                "text": "这是测试转写结果。",
                "confidence": 1.0,
            }
        ]
    if provider != "dashscope":
        raise ASRError(f"不支持的 ASR provider: {provider}")
    return _dashscope_transcribe(Path(file_path), language)


def _dashscope_transcribe(file_path, language):
    api_key = current_app.config["DASHSCOPE_API_KEY"]
    if not api_key:
        raise ASRError("DASHSCOPE_API_KEY 未配置")

    dashscope.api_key = api_key
    uploaded = OssUtils.upload(
        model=current_app.config["FILE_ASR_MODEL"],
        file_path=str(file_path.resolve()),
        api_key=api_key,
    )
    file_url = uploaded[0] if isinstance(uploaded, tuple) else uploaded
    payload = {
        "model": current_app.config["FILE_ASR_MODEL"],
        "input": {"file_urls": [file_url]},
        "parameters": {"language_hints": [language], "channel_id": [0]},
    }
    response = _request_json(
        f"{current_app.config['DASHSCOPE_API_BASE_URL']}"
        "/services/audio/asr/transcription",
        api_key,
        method="POST",
        payload=payload,
        headers={
            "X-DashScope-Async": "enable",
            "X-DashScope-OssResourceResolve": "enable",
        },
    )
    task_id = response.get("output", {}).get("task_id")
    if not task_id:
        raise ASRError(f"提交转写任务失败: {response}")

    deadline = time.monotonic() + 3600
    interval = 2
    while time.monotonic() < deadline:
        task_data = _request_json(
            f"{current_app.config['DASHSCOPE_API_BASE_URL']}/tasks/{task_id}",
            api_key,
        )
        output = task_data.get("output", task_data)
        status = output.get("task_status")
        if status == "SUCCEEDED":
            return _download_segments(output)
        if status in {"FAILED", "CANCELED", "UNKNOWN"}:
            raise ASRError(f"转写任务失败: {status}, {output}")
        time.sleep(interval)
        interval = min(interval + 1, 10)
    raise ASRError("转写任务超过 60 分钟仍未完成")


def _download_segments(output):
    segments = []
    for item in output.get("results", []):
        if item.get("subtask_status") != "SUCCEEDED":
            continue
        url = item.get("transcription_url")
        if not url:
            continue
        with request.urlopen(url, timeout=30) as response:
            result = json.loads(response.read().decode("utf-8"))
        segments.extend(_parse_result_segments(result))
    if not segments:
        raise ASRError("识别完成，但未返回有效文字")
    return segments


def _parse_result_segments(result):
    segments = []
    for transcript in result.get("transcripts", []):
        sentences = transcript.get("sentences") or []
        if sentences:
            for sentence in sentences:
                text = sentence.get("text", "").strip()
                if not text:
                    continue
                segments.append(
                    {
                        "start_time": _milliseconds(
                            sentence.get("begin_time", sentence.get("start_time", 0))
                        ),
                        "end_time": _milliseconds(
                            sentence.get("end_time", sentence.get("stop_time", 0))
                        ),
                        "text": text,
                        "confidence": sentence.get("confidence"),
                    }
                )
        else:
            text = (
                transcript.get("text") or transcript.get("transcript") or ""
            ).strip()
            if text:
                segments.append(
                    {
                        "start_time": 0,
                        "end_time": _milliseconds(
                            transcript.get("content_duration_in_milliseconds", 0)
                        ),
                        "text": text,
                        "confidence": None,
                    }
                )
    return segments


def _milliseconds(value):
    try:
        return float(value or 0) / 1000
    except (TypeError, ValueError):
        return 0


def _request_json(url, api_key, method="GET", payload=None, headers=None):
    request_headers = {"Authorization": f"Bearer {api_key}"}
    request_headers.update(headers or {})
    body = None
    if payload is not None:
        body = json.dumps(payload).encode("utf-8")
        request_headers["Content-Type"] = "application/json"
    req = request.Request(
        url,
        data=body,
        headers=request_headers,
        method=method,
    )
    try:
        with request.urlopen(req, timeout=30) as response:
            raw = response.read().decode("utf-8")
            return json.loads(raw) if raw else {}
    except error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")
        raise ASRError(f"DashScope HTTP {exc.code}: {detail}") from exc
    except error.URLError as exc:
        raise ASRError(f"DashScope 网络请求失败: {exc.reason}") from exc
