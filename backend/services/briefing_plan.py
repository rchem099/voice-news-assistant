from datetime import datetime, timedelta, timezone

import requests


class BriefingPlanError(Exception):
    """The briefing plan could not be prepared."""


def parse_timestamp(value):
    parsed = datetime.fromisoformat(
        value.replace("Z", "+00:00")
    )

    if parsed.tzinfo is None:
        raise ValueError("The timestamp must include a timezone.")

    return parsed.astimezone(timezone.utc)


def calculate_period(last_period_end=None, now=None):
    current_time = now or datetime.now(timezone.utc)

    if current_time.tzinfo is None:
        raise ValueError("The current time must include a timezone.")

    current_time = current_time.astimezone(timezone.utc)

    if last_period_end is None:
        return {
            "period_start": (
                current_time - timedelta(hours=24)
            ).isoformat(),
            "period_end": current_time.isoformat(),
            "first_briefing": True,
            "period_limited": False,
        }

    previous_end = parse_timestamp(last_period_end)

    if previous_end > current_time:
        raise ValueError(
            "The previous briefing ends in the future."
        )

    earliest_allowed = current_time - timedelta(days=30)
    period_limited = previous_end < earliest_allowed

    return {
        "period_start": max(
            previous_end,
            earliest_allowed,
        ).isoformat(),
        "period_end": current_time.isoformat(),
        "first_briefing": False,
        "period_limited": period_limited,
    }


def read_briefings(supabase_url, headers, params):
    try:
        response = requests.get(
            f"{supabase_url}/rest/v1/briefings",
            headers=headers,
            params=params,
            timeout=15,
        )

    except requests.RequestException as error:
        raise BriefingPlanError(
            "Unable to contact the database."
        ) from error

    if response.status_code != 200:
        raise BriefingPlanError(
            "Unable to read your briefings. "
            f"Database returned HTTP {response.status_code}."
        )

    try:
        rows = response.json()

    except ValueError as error:
        raise BriefingPlanError(
            "The database returned invalid JSON."
        ) from error

    if not isinstance(rows, list):
        raise BriefingPlanError(
            "The database returned an unexpected format."
        )

    return rows


def prepare_briefing_plan(supabase_url, headers, user_id):
    # First, look for a briefing that was actually started.
    pending = read_briefings(
        supabase_url,
        headers,
        {
            "user_id": f"eq.{user_id}",
            "status": "eq.in_progress",
            "select": (
                "id,status,period_start,period_end,"
                "summary_text,playback_position_seconds"
            ),
            "order": "created_at.desc,id.desc",
            "limit": "1",
        },
    )

    # Otherwise, look for an already prepared briefing.
    if not pending:
        pending = read_briefings(
            supabase_url,
            headers,
            {
                "user_id": f"eq.{user_id}",
                "status": "eq.ready",
                "select": (
                    "id,status,period_start,period_end,"
                    "summary_text,playback_position_seconds"
                ),
                "order": "created_at.desc,id.desc",
                "limit": "1",
            },
        )

    if pending:
        briefing = pending[0]

        if briefing["status"] == "in_progress":
            message = (
                "You have an unfinished briefing. "
                "Would you like to resume it?"
            )
        else:
            message = (
                "Your previous briefing is ready. "
                "Would you like to listen to it?"
            )

        return {
            "action": "resume",
            "message": message,
            "briefing": briefing,
        }

    completed = read_briefings(
        supabase_url,
        headers,
        {
            "user_id": f"eq.{user_id}",
            "status": "eq.completed",
            "select": "id,period_end,completed_at",
            "order": "period_end.desc,id.desc",
            "limit": "1",
        },
    )

    last_period_end = (
        completed[0]["period_end"]
        if completed
        else None
    )

    try:
        period = calculate_period(last_period_end)

    except (ValueError, TypeError) as error:
        raise BriefingPlanError(
            "A saved briefing contains an invalid date."
        ) from error

    if period["first_briefing"]:
        message = (
            "Would you like a quick overview "
            "of the news from the past 24 hours?"
        )
    elif period["period_limited"]:
        message = (
            "It's been a while since your last briefing. "
            "Would you like an overview of the past 30 days?"
        )
    else:
        message = (
            "Would you like a quick update on what's happened "
            "since your last completed briefing?"
        )

    return {
        "action": "prepare",
        "message": message,
        **period,
    }