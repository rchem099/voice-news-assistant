import threading

import numpy as np
from faster_whisper import WhisperModel


class TranscriptionError(Exception):
    pass


_model = None
_lock = threading.Lock()


def transcribe_pcm(pcm_bytes):
    """
    Entrée :
    PCM signé 16 bits, mono, 16 000 Hz.
    Aucun fichier audio n'est enregistré.
    """
    global _model

    if not pcm_bytes:
        raise TranscriptionError(
            "No audio was received. Please try again."
        )

    audio = (
        np.frombuffer(pcm_bytes, dtype="<i2")
        .astype(np.float32)
        / 32768.0
    )

    try:
        # Un seul chargement et une transcription à la fois.
        with _lock:
            if _model is None:
                _model = WhisperModel(
                    "base.en",
                    device="cpu",
                    compute_type="int8",
                )

            segments, _ = _model.transcribe(
                audio,
                language="en",
                beam_size=3,
                vad_filter=True,
                condition_on_previous_text=False,
            )

            parts = [
                segment.text.strip()
                for segment in segments
                if segment.text.strip()
                and segment.no_speech_prob < 0.6
            ]

    except Exception as error:
        raise TranscriptionError(
            "Local transcription failed. Please try again."
        ) from error

    text = " ".join(parts).strip()

    if not text:
        raise TranscriptionError(
            "I couldn't hear a clear question. Please try again."
        )

    if len(text) > 2000:
        raise TranscriptionError(
            "The question is too long. Please ask a shorter question."
        )

    return text