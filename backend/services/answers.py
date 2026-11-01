from services.openai_generation import GenerationError
from uuid import UUID

import requests

from services.memory import memory_call, MemoryError
from services.timing import timed


class AnswerError(Exception):
    pass


@timed("Database read")
def read_database(url, headers, table, params):
    try:
        response = requests.get(
            f"{url}/rest/v1/{table}",
            headers=headers,
            params=params,
            timeout=15,
        )
        response.raise_for_status()
        rows = response.json()

    except (requests.RequestException, ValueError) as error:
        raise AnswerError(
            "Unable to load the question context."
        ) from error

    if not isinstance(rows, list):
        raise AnswerError("Unexpected database response.")

    return rows


def load_briefing(url, headers, user_id, briefing_id):
    if not briefing_id:
        return None, []

    try:
        briefing_id = str(UUID(briefing_id))
    except (ValueError, TypeError, AttributeError) as error:
        raise AnswerError("Invalid briefing identifier.") from error

    rows = read_database(
        url,
        headers,
        "briefings",
        {
            "id": f"eq.{briefing_id}",
            "user_id": f"eq.{user_id}",
            "select": "id,summary_text,period_start,period_end",
            "limit": "1",
        },
    )

    if not rows:
        raise AnswerError(
            "This briefing is unavailable for your account."
        )

    items = read_database(
        url,
        headers,
        "briefing_items",
        {
            "briefing_id": f"eq.{briefing_id}",
            "select": (
                "articles(id,title,source_name,url,"
                "published_at,rss_description)"
            ),
            "order": "position.asc",
            "limit": "30",
        },
    )

    articles = [
        item["articles"]
        for item in items
        if isinstance(item.get("articles"), dict)
    ]

    return rows[0], articles


@timed("Answer pipeline total")
def answer_question(
    question,
    briefing_id,
    history,
    supabase_url,
    headers,
    user_id,
):
    briefing, briefing_articles = load_briefing(
        supabase_url,
        headers,
        user_id,
        briefing_id,
    )

    preferences = read_database(
        supabase_url,
        headers,
        "preferences",
        {
            "user_id": f"eq.{user_id}",
            "select": "topics,countries,briefing_duration_seconds",
            "limit": "1",
        },
    )

    try:
        memory = memory_call(supabase_url, headers)
    except MemoryError as error:
        raise AnswerError(str(error)) from error

    from services.web_news import answer_from_web

    try:
        return answer_from_web(question, history, briefing)
    except GenerationError as error:
        raise AnswerError(str(error)) from error
