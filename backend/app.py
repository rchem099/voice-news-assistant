import requests
from flask import Flask, jsonify, g

from auth import require_auth, SUPABASE_URL
from listening import listening_api
from questions import questions_api

from services.welcome import build_welcome
from services.briefing import (
    generate_written_briefing,
    BriefingGenerationError,
)
from services.article_selection import (
    select_articles,
    ArticleSelectionError,
)
from services.briefing_plan import (
    prepare_briefing_plan,
    read_briefings,
    BriefingPlanError,
)


app = Flask(__name__)

app.register_blueprint(listening_api)
app.register_blueprint(questions_api)


@app.errorhandler(413)
def request_too_large(error):
    return jsonify(
        error="The uploaded file is too large."
    ), 413


@app.route("/api/health", methods=["GET"])
def health():
    return jsonify({"ok": True})


@app.get("/api/me")
@require_auth
def get_me():
    # L'identité vient du jeton vérifié par Supabase.
    user_id = g.user["id"]

    try:
        response = requests.get(
            f"{SUPABASE_URL}/rest/v1/profiles",
            headers=g.supabase_headers,
            params={
                "id": f"eq.{user_id}",
                "select": "id,first_name,language,timezone",
                "limit": "1",
            },
            timeout=10,
        )
    except requests.RequestException:
        return jsonify(
            error="Impossible de joindre la base de données."
        ), 503

    if response.status_code in (401, 403):
        return jsonify(
            error="Accès au profil refusé."
        ), response.status_code

    if response.status_code != 200:
        return jsonify(
            error=(
                "Impossible de lire le profil. "
                "Vérifie les tables et les règles RLS."
            )
        ), 502

    try:
        profiles = response.json()
    except ValueError:
        return jsonify(
            error="Réponse invalide de la base de données."
        ), 502

    if not isinstance(profiles, list):
        return jsonify(
            error="Format du profil inattendu."
        ), 502

    result = jsonify(
        id=user_id,
        email=g.user.get("email"),
        profile=profiles[0] if profiles else None,
    )

    result.headers["Cache-Control"] = "no-store"

    return result


@app.get("/api/welcome")
@require_auth
def get_welcome():
    user_id = g.user["id"]

    try:
        profile_response = requests.get(
            f"{SUPABASE_URL}/rest/v1/profiles",
            headers=g.supabase_headers,
            params={
                "id": f"eq.{user_id}",
                "select": (
                    "onboarding_completed,"
                    "last_conversation_topic,"
                    "last_conversation_at,"
                    "timezone"
                ),
                "limit": "1",
            },
            timeout=10,
        )

        preferences_response = requests.get(
            f"{SUPABASE_URL}/rest/v1/preferences",
            headers=g.supabase_headers,
            params={
                "user_id": f"eq.{user_id}",
                "select": "remember_history",
                "limit": "1",
            },
            timeout=10,
        )

    except requests.RequestException:
        return jsonify(
            error="Unable to load your welcome message."
        ), 503

    for response in (profile_response, preferences_response):
        if response.status_code in (401, 403):
            return jsonify(
                error="Access denied. Please sign in again."
            ), 401

        if response.status_code != 200:
            return jsonify(
                error="Unable to read your profile or preferences."
            ), 502

    try:
        profiles = profile_response.json()
        preferences = preferences_response.json()

    except ValueError:
        return jsonify(
            error="Invalid response from the database."
        ), 502

    if (
        not isinstance(profiles, list)
        or not isinstance(preferences, list)
    ):
        return jsonify(
            error="Unexpected database response."
        ), 502

    profile = profiles[0] if profiles else {}

    remember_history = (
        bool(preferences)
        and preferences[0].get("remember_history") is True
    )

    onboarding_completed = (
        profile.get("onboarding_completed") is True
    )

    # Utiliser la mémoire uniquement si l'utilisateur l'autorise.
    previous_topic = (
        profile.get("last_conversation_topic")
        if remember_history
        else None
    )

    previous_conversation_at = (
        profile.get("last_conversation_at")
        if remember_history
        else None
    )

    message = build_welcome(
        onboarding_completed=onboarding_completed,
        previous_topic=previous_topic,
        previous_conversation_at=previous_conversation_at,
        timezone_name=profile.get("timezone") or "UTC",
    )

    result = jsonify(
        message=message,
        first_visit=not onboarding_completed,
    )

    result.headers["Cache-Control"] = "no-store"

    return result


@app.get("/api/briefing-plan")
@require_auth
def get_briefing_plan():
    try:
        plan = prepare_briefing_plan(
            supabase_url=SUPABASE_URL,
            headers=g.supabase_headers,
            user_id=g.user["id"],
        )

        # Un bulletin en attente conserve son contenu d'origine.
        if plan["action"] == "prepare":
            selection = select_articles(
                supabase_url=SUPABASE_URL,
                headers=g.supabase_headers,
                user_id=g.user["id"],
                plan=plan,
            )

            plan["selection"] = selection

            if selection["selected_count"] == 0:
                plan["selection_message"] = (
                    "I couldn't find any new articles "
                    "for this briefing in the sources available."
                )
            else:
                plan["selection_message"] = (
                    "Articles are available for your briefing."
                )

    except (BriefingPlanError, ArticleSelectionError) as error:
        return jsonify(error=str(error)), 502

    result = jsonify(plan)
    result.headers["Cache-Control"] = "no-store"

    return result


@app.post("/api/briefings/draft")
@require_auth
def create_briefing_draft():
    try:
        plan = prepare_briefing_plan(
            supabase_url=SUPABASE_URL,
            headers=g.supabase_headers,
            user_id=g.user["id"],
        )

        if plan["action"] == "resume":
            result = jsonify(
                action="resume",
                message=plan["message"],
                briefing=plan["briefing"],
            )

            result.headers["Cache-Control"] = "no-store"
            return result

        selection = select_articles(
            supabase_url=SUPABASE_URL,
            headers=g.supabase_headers,
            user_id=g.user["id"],
            plan=plan,
        )

        if not selection["articles"]:
            result = jsonify(
                action="no_articles",
                message=(
                    "I couldn't find any new articles "
                    "in the available sources for this period."
                ),
                period_start=plan["period_start"],
                period_end=plan["period_end"],
            )

            result.headers["Cache-Control"] = "no-store"
            return result

        previous_rows = read_briefings(
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

        previous_briefings = [
            {
                "period_end": row["period_end"],
                "summary_excerpt": row["summary_text"][:1200],
            }
            for row in previous_rows
        ]

        draft = generate_written_briefing(
            plan=plan,
            selection=selection,
            previous_briefings=previous_briefings,
        )

    except (
        BriefingPlanError,
        ArticleSelectionError,
        BriefingGenerationError,
    ) as error:
        return jsonify(error=str(error)), 502

    result = jsonify(
        action="draft",
        period_start=plan["period_start"],
        period_end=plan["period_end"],
        period_limited=plan["period_limited"],
        draft=draft,
    )

    result.headers["Cache-Control"] = "no-store"

    return result