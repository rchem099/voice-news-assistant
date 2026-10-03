import re
from datetime import timedelta

import requests

from services.briefing_plan import parse_timestamp


class ArticleSelectionError(Exception):
    """The article selection could not be prepared."""


TOPIC_TERMS = {
    "politics": [
        "politics",
        "political",
        "election",
        "government",
        "parliament",
        "president",
        "minister",
        "diplomacy",
    ],
    "economy": [
        "economy",
        "economic",
        "inflation",
        "interest rate",
        "trade",
        "business",
        "market",
        "jobs",
        "bank",
    ],
}


COUNTRY_TERMS = {
    "CA": ["canada", "canadian"],
    "SY": ["syria", "syrian"],
    "US": ["united states", "american", "washington"],
    "GB": ["united kingdom", "britain", "british"],
    "FR": ["france", "french"],
}


def read_rows(supabase_url, headers, table, params):
    rows = []
    offset = 0
    page_size = 200

    while True:
        try:
            response = requests.get(
                f"{supabase_url}/rest/v1/{table}",
                headers=headers,
                params={
                    **params,
                    "limit": str(page_size),
                    "offset": str(offset),
                },
                timeout=15,
            )

        except requests.RequestException as error:
            raise ArticleSelectionError(
                "Unable to contact the database."
            ) from error

        if response.status_code != 200:
            print(
                f"Supabase error on {table}: "
                f"{response.status_code} — {response.text}",
                flush=True,
            )

            raise ArticleSelectionError(
                f"Unable to read {table}. "
                f"Database returned HTTP {response.status_code}."
            )

        try:
            page = response.json()

        except ValueError as error:
            raise ArticleSelectionError(
                "The database returned invalid JSON."
            ) from error

        if not isinstance(page, list):
            raise ArticleSelectionError(
                "Unexpected database response."
            )

        rows.extend(page)

        if len(page) < page_size:
            return rows

        offset += len(page)

        if offset >= 10000:
            raise ArticleSelectionError(
                "Too many records for this prototype. "
                "The selection query needs to be optimized."
            )


def contains_term(text, term):
    term = term.strip().casefold()

    if not term:
        return False

    pattern = r"(?<!\w)" + re.escape(term) + r"(?!\w)"

    return re.search(pattern, text) is not None


def preference_matches(article, preferences):
    text = (
        article["title"]
        + " "
        + (article.get("rss_description") or "")
    ).casefold()

    matches = []

    for topic in preferences.get("topics") or []:
        terms = TOPIC_TERMS.get(
            topic.casefold(),
            [topic],
        )

        if any(contains_term(text, term) for term in terms):
            matches.append(f"topic:{topic}")

    for country in preferences.get("countries") or []:
        terms = COUNTRY_TERMS.get(
            country.upper(),
            [country],
        )

        if any(contains_term(text, term) for term in terms):
            matches.append(f"country:{country}")

    return matches


def select_articles(supabase_url, headers, user_id, plan):
    start = parse_timestamp(plan["period_start"])
    end = parse_timestamp(plan["period_end"])

    oldest_publication = end - timedelta(days=30)

    time_conditions = [
        f"published_at.gte.{start.isoformat()}",
        f"news_updated_at.gte.{start.isoformat()}",
    ]

    if not plan["first_briefing"]:
        time_conditions.append(
            f"first_seen_at.gte.{start.isoformat()}"
        )

    candidates = read_rows(
        supabase_url,
        headers,
        "articles",
        {
            "select": (
                "id,title,source_name,url,published_at,"
                "fetched_at,rss_description,"
                "first_seen_at,news_updated_at"
            ),
            "and": (
                f"(published_at.gte.{oldest_publication.isoformat()},"
                f"published_at.lte.{end.isoformat()})"
            ),
            "first_seen_at": f"lte.{end.isoformat()}",
            "news_updated_at": f"lte.{end.isoformat()}",
            "or": "(" + ",".join(time_conditions) + ")",
            "order": "published_at.desc,id.asc",
        },
    )

    preference_rows = read_rows(
        supabase_url,
        headers,
        "preferences",
        {
            "user_id": f"eq.{user_id}",
            "select": (
                "topics,countries,"
                "briefing_duration_seconds"
            ),
            "order": "user_id.asc",
        },
    )

    preferences = (
        preference_rows[0]
        if preference_rows
        else {}
    )

    history = read_rows(
        supabase_url,
        headers,
        "briefing_items",
        {
            "select": (
                "article_id,"
                "briefings!inner(user_id,status,period_end)"
            ),
            "briefings.user_id": f"eq.{user_id}",
            "briefings.status": "eq.completed",
            "order": "id.asc",
        },
    )

    heard_until = {}

    for item in history:
        article_id = item["article_id"]

        covered_until = parse_timestamp(
            item["briefings"]["period_end"]
        )

        previous = heard_until.get(article_id)

        if previous is None or covered_until > previous:
            heard_until[article_id] = covered_until

    eligible = []
    excluded_as_seen = 0

    for article in candidates:
        previous_coverage = heard_until.get(
            article["id"]
        )

        changed_at = parse_timestamp(
            article["news_updated_at"]
        )

        if (
            previous_coverage is not None
            and changed_at <= previous_coverage
        ):
            excluded_as_seen += 1
            continue

        matches = preference_matches(
            article,
            preferences,
        )

        if previous_coverage is not None:
            reason = "changed_since_previous_briefing"

        elif parse_timestamp(article["published_at"]) >= start:
            reason = "published_in_period"

        elif changed_at >= start:
            reason = "updated_or_newly_observed"

        else:
            reason = "late_arrival"

        eligible.append({
            **article,
            "preference_matches": matches,
            "selection_reason": reason,
        })

    eligible.sort(
        key=lambda article: (
            len(article["preference_matches"]),
            parse_timestamp(article["published_at"]),
        ),
        reverse=True,
    )

    selected = eligible[:10]

    return {
        "preferences_used": preferences,
        "candidate_count": len(candidates),
        "excluded_as_seen": excluded_as_seen,
        "eligible_count": len(eligible),
        "selected_count": len(selected),
        "selection_limited": len(eligible) > len(selected),
        "articles": selected,
    }