from calendar import timegm
from datetime import datetime, timezone
from html import unescape
from html.parser import HTMLParser

import feedparser
import requests


NEWS_FEEDS = {
    "world": "https://feeds.bbci.co.uk/news/world/rss.xml",
    "middle_east": (
        "https://feeds.bbci.co.uk/news/world/middle_east/rss.xml"
    ),
    "business": "https://feeds.bbci.co.uk/news/business/rss.xml",
}


class NewsSourceError(Exception):
    """The news source could not be downloaded or understood."""


class PlainTextParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.parts = []

    def handle_data(self, data):
        self.parts.append(data)


def clean_description(value):
    parser = PlainTextParser()
    parser.feed(value)

    return " ".join(
        unescape(" ".join(parser.parts)).split()
    )


def fetch_news(category="world", limit=10):
    if category not in NEWS_FEEDS:
        raise ValueError(
            "Unknown category. Use world, middle_east or business."
        )

    if not isinstance(limit, int) or not 1 <= limit <= 50:
        raise ValueError("Limit must be between 1 and 50.")

    try:
        response = requests.get(
            NEWS_FEEDS[category],
            headers={
                "User-Agent": "VoiceNewsAssistant/0.1",
                "Accept": (
                    "application/rss+xml, "
                    "application/xml, text/xml"
                ),
            },
            timeout=20,
        )

        response.raise_for_status()

    except requests.RequestException as error:
        raise NewsSourceError(
            f"Unable to download the {category} feed."
        ) from error

    feed = feedparser.parse(response.content)

    # Do not confuse an HTML error page with an empty RSS feed.
    if not feed.get("version"):
        raise NewsSourceError(
            "The source did not return a recognized RSS or Atom feed."
        )

    if feed.get("bozo") and not feed.entries:
        raise NewsSourceError(
            "The feed could not be read correctly."
        )

    fetched_at = datetime.now(timezone.utc).isoformat()

    articles = []
    seen_urls = set()

    for entry in feed.entries:
        title = entry.get("title", "").strip()
        url = entry.get("link", "").strip()
        published = entry.get("published_parsed")

        # A date is required for selecting news since the last visit.
        if not title or not published:
            continue

        if not url.startswith(("https://", "http://")):
            continue

        if url in seen_urls:
            continue

        published_at = datetime.fromtimestamp(
            timegm(published),
            tz=timezone.utc,
        ).isoformat()

        articles.append({
            "title": title,
            "source_name": "BBC News",
            "url": url,
            "published_at": published_at,
            "fetched_at": fetched_at,
            "description": clean_description(
                entry.get("summary", "")
            ),
            "category": category,
        })

        seen_urls.add(url)

    articles.sort(
        key=lambda article: article["published_at"],
        reverse=True,
    )

    return articles[:limit]