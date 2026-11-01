import os
from pathlib import Path
from time import perf_counter

from dotenv import load_dotenv
from openai import (
    OpenAI,
    OpenAIError,
    AuthenticationError,
    RateLimitError,
    APITimeoutError,
)
from pydantic import ValidationError


BACKEND_DIR = Path(__file__).resolve().parent.parent
load_dotenv(BACKEND_DIR / ".env")


class GenerationError(Exception):
    pass


def generate_structured(
    *,
    system_prompt,
    user_message,
    output_type,
    max_output_tokens=1200,
):
    api_key = os.getenv("OPENAI_API_KEY", "").strip()

    if not api_key:
        raise GenerationError(
            "OPENAI_API_KEY is missing from backend/.env."
        )

    started = perf_counter()

    try:
        with OpenAI(
            api_key=api_key,
            timeout=45.0,
            max_retries=0,
        ) as client:
            response = client.responses.parse(
                model=os.getenv(
                    "OPENAI_MODEL",
                    "gpt-4.1-mini",
                ),
                instructions=system_prompt,
                input=user_message,
                text_format=output_type,
                max_output_tokens=max_output_tokens,
                store=False,
            )

        if response.status != "completed":
            raise GenerationError(
                "The AI response was not completed. Please try again."
            )

        result = response.output_parsed

        if result is None:
            raise GenerationError(
                "The AI did not return a usable structured response."
            )

        return result

    except AuthenticationError as error:
        raise GenerationError(
            "Invalid OpenAI API key. Check backend/.env."
        ) from error

    except RateLimitError as error:
        raise GenerationError(
            "OpenAI quota or rate limit reached. "
            "Check API billing and usage."
        ) from error

    except APITimeoutError as error:
        raise GenerationError(
            "OpenAI took too long to respond. Please try again."
        ) from error

    except (OpenAIError, ValidationError, ValueError) as error:
        print(
            f"[OPENAI ERROR] {type(error).__name__}",
            flush=True,
        )
        raise GenerationError(
            "Unable to generate a valid AI response."
        ) from error

    finally:
        elapsed = perf_counter() - started
        print(
            f"[TIMING] OpenAI generation: {elapsed:.2f} seconds",
            flush=True,
        )