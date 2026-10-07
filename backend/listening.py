from datetime import datetime, timezone

import requests
from flask import Blueprint, g, jsonify, request

from auth import require_auth, SUPABASE_URL
from services.article_selection import (
    select_articles,
    ArticleSelectionError,
)
from services.briefing import (
    generate_written_briefing,
    BriefingGenerationError,
)
from services.briefing_plan import (
    prepare_briefing_plan,
    read_briefings,
    BriefingPlanError,
)


listening_api = Blueprint("listening_api", __name__)


class ListeningError(Exception):
    pass


def database_request(method, path, *, params=None, payload=None):
    try:
        response = requests.request(
            method,
            f"{SUPABASE_URL}/rest/v1/{path}",
            headers={
                **g.supabase_headers,
                "Prefer": "return=representation",
            },
            params=params,
            json=payload,
            timeout=20,
        )
    except requests.RequestException as error:
        raise ListeningError(
            "Unable to contact the database."
        ) from error

    if not response.ok:
        raise ListeningError(
            f"Database request failed: HTTP {response.status_code}."
        )

    try:
        return response.json()
    except ValueError as error:
        raise ListeningError(
            "Invalid database response."
        ) from error


def private_response(**values):
    response = jsonify(**values)
    response.headers["Cache-Control"] = "no-store"
    return response


@listening_api.post("/api/briefings/listen")
@require_auth
def prepare_saved_briefing():
    try:
        plan = prepare_briefing_plan(
            SUPABASE_URL,
            g.supabase_headers,
            g.user["id"],
        )

        if plan["action"] == "resume":
            return private_response(
                action="resume",
                briefing=plan["briefing"],
            )

        selection = select_articles(
            SUPABASE_URL,
            g.supabase_headers,
            g.user["id"],
            plan,
        )

        if not selection["articles"]:
            return private_response(
                action="no_articles",
                message="No new articles are available for this period.",
            )

        previous = read_briefings(
            SUPABASE_URL,
            g.supabase_headers,
            {
                "user_id": f"eq.{g.user['id']}",
                "status": "eq.completed",
                "select": "period_end,summary_text",
                "order": "period_end.desc,id.desc",
                "limit": "3",
            },
        )

        draft = generate_written_briefing(
            plan,
            selection,
            [
                {
                    "period_end": row["period_end"],
                    "summary_excerpt": row["summary_text"][:1200],
                }
                for row in previous
            ],
        )

        # Seulement les articles effectivement cités par le bulletin.
        article_ids = list(dict.fromkeys(
            article_id
            for topic in draft["topics"]
            for article_id in topic["source_ids"]
        ))

        saved = database_request(
            "POST",
            "rpc/save_ready_briefing",
            payload={
                "p_period_start": plan["period_start"],
                "p_period_end": plan["period_end"],
                "p_summary": draft["spoken_text"],
                "p_article_ids": article_ids,
            },
        )

        if not isinstance(saved, dict) or not saved.get("id"):
            raise ListeningError("The briefing was not saved correctly.")

        return private_response(
            action="ready",
            briefing=saved,
        )

    except (
        BriefingPlanError,
        ArticleSelectionError,
        BriefingGenerationError,
        ListeningError,
    ) as error:
        return jsonify(error=str(error)), 502


@listening_api.patch("/api/briefings/<uuid:briefing_id>/progress")
@require_auth
def update_progress(briefing_id):
    body = request.get_json(silent=True)

    if not isinstance(body, dict):
        return jsonify(error="A JSON object is required."), 400

    state = body.get("status")

    if state not in ("in_progress", "completed"):
        return jsonify(error="Invalid listening status."), 400

    owner_filter = {
        "id": f"eq.{briefing_id}",
        "user_id": f"eq.{g.user['id']}",
    }

    payload = {"status": state}
    filters = dict(owner_filter)

    if state == "in_progress":
        # Une ancienne requête ne peut pas annuler une fin d'écoute.
        filters["status"] = "eq.ready"
    else:
        filters["status"] = "eq.in_progress"
        payload["completed_at"] = datetime.now(
            timezone.utc
        ).isoformat()

    try:
        rows = database_request(
            "PATCH",
            "briefings",
            params=filters,
            payload=payload,
        )

        if not isinstance(rows, list):
            raise ListeningError("Unexpected progress response.")

        if not rows:
            # Vérifier l'existence et la propriété, avec le même jeton.
            rows = database_request(
                "GET",
                "briefings",
                params={
                    **owner_filter,
                    "select": "id,status,completed_at",
                    "limit": "1",
                },
            )

            if not rows:
                return jsonify(error="Briefing not found."), 404

            existing = rows[0]["status"]

            if state == "completed" and existing == "ready":
                return jsonify(
                    error="The briefing has not started."
                ), 409

        return private_response(briefing=rows[0])

    except ListeningError as error:
        return jsonify(error=str(error)), 502