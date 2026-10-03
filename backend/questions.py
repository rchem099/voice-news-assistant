import subprocess
import threading
import time
from collections import deque

import imageio_ffmpeg
from flask import Blueprint, g, jsonify, request

from auth import require_auth


questions_api = Blueprint("questions_api", __name__)

MAX_AUDIO_BYTES = 8 * 1024 * 1024
MAX_REQUEST_BYTES = 9 * 1024 * 1024

# Limite pour le prototype local :
# cinq tentatives par minute et par utilisateur.
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

    # Audio PCM : 16 000 échantillons par seconde,
    # deux octets par échantillon, un canal.
    duration = len(decoded.stdout) / (16000 * 2)

    if duration > 60:
        return jsonify(
            error="Questions must be no longer than 60 seconds."
        ), 422

    if duration < 0.3:
        return jsonify(
            error="The recording is too short."
        ), 422

    response = jsonify(
        received=True,
        bytes=len(audio),
        duration_seconds=round(duration, 2),
        message=(
            "Audio received successfully. "
            "Transcription is not connected yet."
        ),
    )

    response.headers["Cache-Control"] = "no-store"
    return response