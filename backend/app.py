from services.article_selection import (
    select_articles,
    ArticleSelectionError,
)
import requests
from services.welcome import build_welcome
from services.briefing_plan import (
    prepare_briefing_plan,
    BriefingPlanError,
)
from flask import Flask, jsonify, g
from auth import require_auth, SUPABASE_URL

app = Flask(__name__)


@app.route("/api/health", methods=["GET"])
def health():
    return jsonify({"ok": True})

@app.get("/api/me")
@require_auth
def get_me():
    # L’identité vient du jeton vérifié par Supabase.
    user_id = g.user["id"]

    # Lire uniquement le profil de cet utilisateur.
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
            error="Impossible de lire le profil. Vérifie les tables et les règles RLS."
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

    if not isinstance(profiles, list) or not isinstance(preferences, list):
        return jsonify(
            error="Unexpected database response."
        ), 502

    # An account without a profile receives the first greeting.
    profile = profiles[0] if profiles else {}

    remember_history = (
        bool(preferences)
        and preferences[0].get("remember_history") is True
    )

    onboarding_completed = (
        profile.get("onboarding_completed") is True
    )

    # Do not use conversation memory if the user has disabled it.
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

        # A pending briefing keeps its original content.
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