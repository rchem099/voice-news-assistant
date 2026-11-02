import os
from functools import wraps
from pathlib import Path

import requests
from dotenv import load_dotenv
from flask import g, jsonify, request

# Charger le fichier .env situé dans backend.
load_dotenv(Path(__file__).resolve().parent / ".env")

SUPABASE_URL = os.getenv("SUPABASE_URL", "").strip().rstrip("/")
SUPABASE_KEY = os.getenv("SUPABASE_PUBLISHABLE_KEY", "").strip()


def require_auth(view):
    @wraps(view)
    def wrapped(*args, **kwargs):
        # 1. Lire le jeton envoyé par React.
        authorization = request.headers.get("Authorization", "")
        parts = authorization.split()

        if (
            len(parts) != 2
            or parts[0].lower() != "bearer"
        ):
            return jsonify(error="Sign in required."), 401

        token = parts[1]

        if not SUPABASE_URL or not SUPABASE_KEY:
            return jsonify(
                error="Server Supabase configuration is missing."
            ), 503

        headers = {
            "apikey": SUPABASE_KEY,
            "Authorization": f"Bearer {token}",
        }

        # 2. Demander à Supabase de vérifier le jeton.
        try:
            response = requests.get(
                f"{SUPABASE_URL}/auth/v1/user",
                headers=headers,
                timeout=10,
            )
        except requests.RequestException:
            return jsonify(
                error="Authentication service is unavailable."
            ), 503

        if response.status_code in (401, 403):
            return jsonify(
                error="Your session is invalid or expired. Please sign in again."
            ), 401

        if response.status_code != 200:
            return jsonify(
                error="Unable to verify your session."
            ), 502

        try:
            user = response.json()
        except ValueError:
            return jsonify(
                error="Invalid authentication response."
            ), 502

        if not isinstance(user, dict) or not user.get("id"):
            return jsonify(
                error="User not authenticated."
            ), 401

        # 3. Conserver l’identité pour cette requête seulement.
        g.user = user
        g.supabase_headers = headers

        return view(*args, **kwargs)

    return wrapped