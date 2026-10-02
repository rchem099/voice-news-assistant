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