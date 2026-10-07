import os

import requests


class ArticleStoreError(Exception):
    """Articles could not be saved in the database."""


def save_articles(articles):
    if not articles:
        return 0

    supabase_url = os.getenv(
        "SUPABASE_URL", ""
    ).strip().rstrip("/")

    secret_key = os.getenv(
        "SUPABASE_SECRET_KEY", ""
    ).strip()

    if not supabase_url or not secret_key:
        raise ArticleStoreError(
            "Missing SUPABASE_URL or SUPABASE_SECRET_KEY "
            "in backend/.env."
        )

    if not secret_key.startswith("sb_secret_"):
        raise ArticleStoreError(
            "Use a Supabase secret key starting with sb_secret_."
        )

    # Deduplicate this batch before sending it to PostgreSQL.
    rows_by_url = {}

    for article in articles:
        rows_by_url[article["url"]] = {
            "title": article["title"],
            "source_name": article["source_name"],
            "url": article["url"],
            "published_at": article["published_at"],
            "fetched_at": article["fetched_at"],
            "rss_description": article["description"],
        }

    rows = list(rows_by_url.values())

    try:
        response = requests.post(
            f"{supabase_url}/rest/v1/articles",
            headers={
                "apikey": secret_key,
                "Content-Type": "application/json",
                "Prefer": (
                    "resolution=merge-duplicates,"
                    "return=minimal"
                ),
            },
            params={
                "on_conflict": "url",
            },
            json=rows,
            timeout=30,
        )

    except requests.RequestException as error:
        raise ArticleStoreError(
            "Unable to contact the database."
        ) from error

    if not response.ok:
        raise ArticleStoreError(
            f"Database returned HTTP {response.status_code}. "
            "Check the secret key, table columns and permissions."
        )

    return len(rows)