import json
import subprocess
import threading
import time
from collections import deque

import imageio_ffmpeg
from flask import Blueprint, g, jsonify, request

from auth import SUPABASE_URL, require_auth
from services.answers import answer_question, AnswerError
from services.memory import (
    handle_memory_command,
    detect_topic,
    memory_call,
    MemoryError,
)
from services.transcription import (
    transcribe_pcm,
    TranscriptionError,
)


questions_api = Blueprint("questions_api", __name__)

MAX_AUDIO_BYTES = 8 * 1024 * 1024
MAX_REQUEST_BYTES = 9 * 1024 * 1024

attempts = {}
attempts_lock = threading.Lock()


def allow_upload(user_id):
    now = time.monotonic()

    with attempts_lock:
        expired = [
            key
            for key, values in attempts.items()
            if not values or values[-1] <= now - 60
        ]

        for key in expired:
            del attempts[key]

        values = attempts.setdefault(user_id, deque())

        while values and values[0] <= now - 60:
            values.popleft()

        if len(values) >= 5:
            return False

        values.append(now)
        return True


@questions_api.post("/api/questions")
@require_auth
def receive_question():
    request.max_content_length = MAX_REQUEST_BYTES

    if not allow_upload(g.user["id"]):
        response = jsonify(
            error="Too many uploads. Wait one minute and try again."
        )
        response.status_code = 429
        response.headers["Retry-After"] = "60"
        return response

    upload = request.files.get("audio")

    if upload is None:
        return jsonify(error="The audio file is missing."), 400

    formats = {
        "audio/webm": "matroska",
        "audio/ogg": "ogg",
        "audio/mp4": "mov",
    }

    input_format = formats.get(upload.mimetype)

    if input_format is None:
        return jsonify(error="Unsupported audio format."), 415

    audio = upload.read(MAX_AUDIO_BYTES + 1)

    if not audio:
        return jsonify(error="The audio file is empty."), 400

    if len(audio) > MAX_AUDIO_BYTES:
        return jsonify(error="The audio file is too large."), 413

    try:
        executable = imageio_ffmpeg.get_ffmpeg_exe()

        decoded = subprocess.run(
            [
                executable,
                "-hide_banner",
                "-loglevel", "error",
                "-xerror",
                "-protocol_whitelist", "pipe",
                "-f", input_format,
                "-i", "pipe:0",
                "-map", "0:a:0",
                "-vn",
                "-t", "61",
                "-ac", "1",
                "-ar", "16000",
                "-f", "s16le",
                "pipe:1",
            ],
            input=audio,
            capture_output=True,
            timeout=30,
            check=False,
        )

    except (OSError, RuntimeError):
        return jsonify(
            error="FFmpeg is unavailable on the server."
        ), 503

    except subprocess.TimeoutExpired:
        return jsonify(
            error="Audio validation took too long."
        ), 422

    if decoded.returncode != 0 or not decoded.stdout:
        return jsonify(
            error="The file could not be decoded as valid audio."
        ), 422

    # PCM : 16 000 échantillons/s, deux octets, un canal.
    duration = len(decoded.stdout) / (16000 * 2)

    if duration > 60:
        return jsonify(
            error="Questions must be no longer than 60 seconds."
        ), 422

    if duration < 0.3:
        return jsonify(
            error="The recording is too short."
        ), 422

    # 1. Transcrire la question.
    try:
        transcript = transcribe_pcm(decoded.stdout)
    except TranscriptionError as error:
        return jsonify(error=str(error)), 422

    # 2. Traiter les commandes de gestion de la mémoire.
    try:
        command = handle_memory_command(
            transcript,
            SUPABASE_URL,
            g.supabase_headers,
        )
    except MemoryError as error:
        return jsonify(error=str(error)), 502

    if command is not None:
        response = jsonify(
            received=True,
            transcript=transcript,
            **command,
        )
        response.headers["Cache-Control"] = "no-store"
        return response

    # 3. Valider le contexte de conversation.
    try:
        history = json.loads(
            request.form.get("history", "[]")
        )
    except (ValueError, TypeError):
        return jsonify(
            error="Invalid conversation history."
        ), 400

    if (
        not isinstance(history, list)
        or len(history) > 8
        or any(
            not isinstance(item, dict)
            or item.get("role") not in ("user", "assistant")
            or not isinstance(item.get("content"), str)
            or len(item["content"]) > 3000
            for item in history
        )
    ):
        return jsonify(
            error="Invalid conversation history."
        ), 400

    # 4. Générer la réponse.
    try:
        result = answer_question(
            question=transcript,
            briefing_id=request.form.get("briefing_id"),
            history=history,
            supabase_url=SUPABASE_URL,
            headers=g.supabase_headers,
            user_id=g.user["id"],
        )
    except AnswerError as error:
        return jsonify(
            error=str(error),
            transcript=transcript,
        ), 502

    # 5. Enregistrer le sujet si la mémoire est activée.
    # La fonction SQL vérifie le consentement de l'utilisateur.
    topic = detect_topic(transcript)

    if topic is not None:
        try:
            memory_call(
                SUPABASE_URL,
                g.supabase_headers,
                action="record",
                topic=topic,
            )
        except MemoryError as error:
            print(
                f"Unable to save interest: {error}",
                flush=True,
            )

            previous_warning = result.get("coverage_warning")
            memory_warning = (
                "Your answer is ready, but your interest "
                "could not be saved."
            )

            result["coverage_warning"] = (
                f"{previous_warning} {memory_warning}"
                if previous_warning
                else memory_warning
            )

    # 6. Envoyer la réponse au navigateur.
    response = jsonify(
        received=True,
        transcript=transcript,
        **result,
    )
    response.headers["Cache-Control"] = "no-store"
    return response