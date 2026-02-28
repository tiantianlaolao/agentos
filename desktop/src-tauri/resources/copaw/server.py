#!/usr/bin/env python3
"""
CoPaw Runtime — AgentScope-compatible HTTP server for AgentOS.

Implements:
  POST /process  — Agent API Protocol (SSE streaming)
  POST /ag-ui    — AG-UI protocol (richer tool events, SSE)
  GET  /health   — Health check

Backend: DeepSeek API (OpenAI-compatible).
"""

import os
import json
import time
import uuid
import asyncio
from pathlib import Path
from typing import AsyncGenerator

# Load .env from script directory
from dotenv import load_dotenv
load_dotenv(Path(__file__).parent / ".env")

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from sse_starlette.sse import EventSourceResponse
import httpx

# ── Configuration ──

DEEPSEEK_API_KEY = os.environ.get("LLM_API_KEY") or os.environ.get("DEEPSEEK_API_KEY", "")
DEEPSEEK_BASE_URL = os.environ.get("LLM_BASE_URL") or os.environ.get("DEEPSEEK_BASE_URL", "https://api.deepseek.com/v1")
DEEPSEEK_MODEL = os.environ.get("LLM_MODEL") or os.environ.get("DEEPSEEK_MODEL", "deepseek-chat")

SYSTEM_PROMPT = os.environ.get("SYSTEM_PROMPT", (
    "You are CoPaw Assistant, a helpful AI assistant running on AgentScope Runtime. "
    "Keep responses concise and helpful. Respond in the same language the user uses."
))

PORT = int(os.environ.get("COPAW_PORT", "8088"))
HOST = os.environ.get("COPAW_HOST", "0.0.0.0")

app = FastAPI(title="CoPaw Runtime", version="0.1.0")

# ── Session memory (simple in-memory history) ──

sessions: dict[str, list[dict]] = {}
MAX_HISTORY = 20


def get_session_messages(session_id: str) -> list[dict]:
    if session_id not in sessions:
        sessions[session_id] = []
    return sessions[session_id]


def trim_history(session_id: str):
    msgs = sessions.get(session_id, [])
    if len(msgs) > MAX_HISTORY * 2:
        sessions[session_id] = msgs[-MAX_HISTORY * 2:]


# ── DeepSeek streaming ──

async def stream_deepseek(
    messages: list[dict],
    session_id: str,
) -> AsyncGenerator[str, None]:
    """Call DeepSeek API with streaming and yield text deltas."""
    if not DEEPSEEK_API_KEY:
        yield "Error: DEEPSEEK_API_KEY not configured"
        return

    history = get_session_messages(session_id)

    api_messages = [{"role": "system", "content": SYSTEM_PROMPT}]
    # Add history
    for msg in history:
        api_messages.append(msg)
    # Add current user message(s)
    for msg in messages:
        api_messages.append(msg)
        history.append(msg)

    async with httpx.AsyncClient(timeout=60.0) as client:
        async with client.stream(
            "POST",
            f"{DEEPSEEK_BASE_URL}/chat/completions",
            headers={
                "Authorization": f"Bearer {DEEPSEEK_API_KEY}",
                "Content-Type": "application/json",
            },
            json={
                "model": DEEPSEEK_MODEL,
                "messages": api_messages,
                "stream": True,
            },
        ) as response:
            if response.status_code != 200:
                body = await response.aread()
                yield f"Error: DeepSeek API returned {response.status_code}: {body.decode()[:200]}"
                return

            full_content = ""
            async for line in response.aiter_lines():
                if not line.startswith("data: "):
                    continue
                data_str = line[6:].strip()
                if data_str == "[DONE]":
                    break
                try:
                    chunk = json.loads(data_str)
                    delta = chunk.get("choices", [{}])[0].get("delta", {}).get("content", "")
                    if delta:
                        full_content += delta
                        yield delta
                except (json.JSONDecodeError, IndexError, KeyError):
                    continue

            # Save assistant response to history
            if full_content:
                history.append({"role": "assistant", "content": full_content})
                trim_history(session_id)


# ── /process endpoint (Agent API Protocol) ──

@app.post("/process")
async def process_endpoint(request: Request):
    """
    Agent API Protocol endpoint.

    Request: {
      "input": [{"role": "user", "content": [{"type": "text", "text": "..."}]}],
      "session_id": "..."
    }

    Response: SSE stream with data: {"output":[{"content":[{"type":"text","text":"..."}]}]}
    """
    body = await request.json()

    session_id = body.get("session_id", "default")
    input_msgs = body.get("input", [])

    # Parse input into standard messages
    messages = []
    for msg in input_msgs:
        role = msg.get("role", "user")
        content_parts = msg.get("content", [])
        if isinstance(content_parts, str):
            messages.append({"role": role, "content": content_parts})
        elif isinstance(content_parts, list):
            text = " ".join(
                p.get("text", "") for p in content_parts if p.get("type") == "text"
            )
            if text:
                messages.append({"role": role, "content": text})

    if not messages:
        return JSONResponse({"error": "No input messages"}, status_code=400)

    async def event_generator():
        async for delta in stream_deepseek(messages, session_id):
            sse_data = json.dumps({
                "output": [{"content": [{"type": "text", "text": delta}]}]
            }, ensure_ascii=False)
            yield {"data": sse_data}
        yield {"data": "[DONE]"}

    return EventSourceResponse(event_generator())


# ── /ag-ui endpoint (AG-UI Protocol) ──

@app.post("/ag-ui")
async def ag_ui_endpoint(request: Request):
    """
    AG-UI protocol endpoint with richer lifecycle events.

    Request: {
      "threadId": "...",
      "runId": "...",
      "messages": [{"id": "...", "role": "user", "content": "..."}],
      "tools": [],
      "context": [],
      "forwardedProps": {}
    }

    Response: SSE stream with lifecycle events.
    """
    body = await request.json()

    thread_id = body.get("threadId", "default")
    run_id = body.get("runId", f"run_{int(time.time())}")
    input_messages = body.get("messages", [])

    # Parse messages
    messages = []
    for msg in input_messages:
        role = msg.get("role", "user")
        content = msg.get("content", "")
        if content:
            messages.append({"role": role, "content": content})

    if not messages:
        return JSONResponse({"error": "No messages"}, status_code=400)

    async def event_generator():
        # RUN_STARTED
        yield {"data": json.dumps({
            "type": "RUN_STARTED",
            "runId": run_id,
            "threadId": thread_id,
        })}

        # TEXT_MESSAGE_START
        msg_id = f"msg_{uuid.uuid4().hex[:12]}"
        yield {"data": json.dumps({
            "type": "TEXT_MESSAGE_START",
            "messageId": msg_id,
        })}

        # Stream content
        try:
            async for delta in stream_deepseek(messages, thread_id):
                yield {"data": json.dumps({
                    "type": "TEXT_MESSAGE_CONTENT",
                    "messageId": msg_id,
                    "delta": delta,
                }, ensure_ascii=False)}
        except Exception as e:
            yield {"data": json.dumps({
                "type": "RUN_ERROR",
                "message": str(e),
            })}
            return

        # TEXT_MESSAGE_END
        yield {"data": json.dumps({
            "type": "TEXT_MESSAGE_END",
            "messageId": msg_id,
        })}

        # RUN_FINISHED
        yield {"data": json.dumps({
            "type": "RUN_FINISHED",
            "runId": run_id,
        })}

        yield {"data": "[DONE]"}

    return EventSourceResponse(event_generator())


# ── /skills endpoint ──

# Built-in skills — CoPaw runtime ships with a default set of capabilities.
# These are reported to the client so the UI can display available skills.
BUILTIN_SKILLS = [
    {
        "name": "chat",
        "content": '---\ndescription: "General-purpose conversational AI assistant"\n---',
        "source": "CoPaw",
        "enabled": True,
    },
    {
        "name": "code_assist",
        "content": '---\ndescription: "Help with code writing, debugging, and explanation"\n---',
        "source": "CoPaw",
        "enabled": True,
    },
    {
        "name": "translation",
        "content": '---\ndescription: "Translate text between languages"\n---',
        "source": "CoPaw",
        "enabled": True,
    },
    {
        "name": "summarization",
        "content": '---\ndescription: "Summarize long texts and documents"\n---',
        "source": "CoPaw",
        "enabled": True,
    },
]


@app.get("/skills")
async def list_skills():
    return BUILTIN_SKILLS


# ── /health endpoint ──

@app.get("/health")
async def health():
    return {
        "status": "ok",
        "runtime": "CoPaw (AgentScope)",
        "model": DEEPSEEK_MODEL,
        "version": "0.2.0",
    }


# ── Main ──

if __name__ == "__main__":
    import uvicorn

    if not DEEPSEEK_API_KEY:
        print("WARNING: DEEPSEEK_API_KEY not set. Set it in environment or .env file.")

    print(f"[CoPaw Runtime] Starting on {HOST}:{PORT}")
    print(f"[CoPaw Runtime] Model: {DEEPSEEK_MODEL}")
    print(f"[CoPaw Runtime] Endpoints: /process, /ag-ui, /health")

    uvicorn.run(app, host=HOST, port=PORT, log_level="info")
