from calendar import timegm
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from html import unescape
from html.parser import HTMLParser

import feedparser
import requests

from services.timing import timed


NEWS_FEEDS = {
    "world": [
        ("BBC News", "https://feeds.bbci.co.uk/news/world/rss.xml"),
        ("The Guardian", "https://www.theguardian.com/world/rss"),
        ("Al Jazeera English", "https://www.aljazeera.com/xml/rss/all.xml"),
        ("DW", "https://rss.dw.com/rdf/rss-en-all"),
        ("France 24", "https://www.france24.com/en/rss"),
        ("CBC News", "https://www.cbc.ca/webfeed/rss/rss-world"),
    ],
    "middle_east": [
        (
            "BBC News",
            "https://feeds.bbci.co.uk/news/world/middle_east/rss.xml",
        ),
        (
            "The Guardian",
            "https://www.theguardian.com/world/middleeast/rss",
        ),
        (
            "France 24",
            "https://www.france24.com/en/middle-east/rss",
        ),
    ],
    "business": [
        (
            "BBC News",
            "https://feeds.bbci.co.uk/news/business/rss.xml",
        ),
        (
            "The Guardian",
            "https://www.theguardian.com/business/rss",
        ),
        ("DW", "https://rss.dw.com/rdf/rss-en-bus"),
        ("CBC News", "https://www.cbc.ca/webfeed/rss/rss-business"),
    ],
    "africa": [
        (
            "BBC News",
            "https://feeds.bbci.co.uk/news/world/africa/rss.xml",
        ),
        (
            "The Guardian",
            "https://www.theguardian.com/world/africa/rss",
        ),
        ("France 24", "https://www.france24.com/en/africa/rss"),
    ],
    "morocco": [
        (
            "Morocco World News",
            "https://www.moroccoworldnews.com/feed/",
        ),
        (
            "The Guardian",
            "https://www.theguardian.com/world/morocco/rss",
        ),
    ],
}


class NewsSourceError(Exception):
    pass


class PlainTextParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.parts = []

    def handle_data(self, data):
        self.parts.append(data)


def clean_description(value):
    parser = PlainTextParser()
    parser.feed(value or "")

    return " ".join(
        unescape(" ".join(parser.parts)).split()
    )


def download_feed(source_name, feed_url, category):
    try:
        response = requests.get(
            feed_url,
            headers={
                "User-Agent": "VoiceNewsAssistant/0.1",
                "Accept": (
                    "application/rss+xml, application/atom+xml, "
                    "application/xml, text/xml"
                ),
            },
            timeout=(5, 10),
        )
        response.raise_for_status()

    except requests.RequestException as error:
        raise NewsSourceError(
            f"Unable to download {source_name} / {category}: {error}"
        ) from error

    feed = feedparser.parse(response.content)

    if not feed.get("version"):
        raise NewsSourceError(
            f"{source_name} / {category}: "
            "the response is not a recognized RSS or Atom feed."
        )

    if feed.get("bozo") and not feed.entries:
        raise NewsSourceError(
            f"{source_name} / {category}: the feed could not be parsed."
        )

    fetched_at = datetime.now(timezone.utc).isoformat()
    articles = []
    seen_urls = set()

    for entry in feed.entries:
        title = (entry.get("title") or "").strip()
        url = (entry.get("link") or "").strip()
        published = entry.get("published_parsed")

        # Une date de publication réelle est nécessaire.
        if not title or not published:
            continue

        if not url.startswith(("https://", "http://")):
            continue

        if url in seen_urls:
            continue

        try:
            published_at = datetime.fromtimestamp(
                timegm(published),
                tz=timezone.utc,
            ).isoformat()
        except (ValueError, OverflowError, TypeError):
            continue

        articles.append({
            "title": title,
            "source_name": source_name,
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

    return articles


@timed("RSS download and parsing")
def fetch_news(category="world", limit=10):
    if category not in NEWS_FEEDS:
        raise ValueError("Unknown news category.")

    if not isinstance(limit, int) or not 1 <= limit <= 50:
        raise ValueError("Limit must be between 1 and 50.")

    feeds = NEWS_FEEDS[category]
    batches = []
    successful_feeds = 0

    # Les médias d'une catégorie sont téléchargés en parallèle.
    with ThreadPoolExecutor(max_workers=min(8, len(feeds))) as executor:
        jobs = [
            (
                source_name,
                executor.submit(
                    download_feed,
                    source_name,
                    feed_url,
                    category,
                ),
            )
            for source_name, feed_url in feeds
        ]

        for source_name, future in jobs:
            try:
                articles = future.result()
                successful_feeds += 1
                batches.append(articles)

                print(
                    f"[NEWS] {category} / {source_name}: "
                    f"{len(articles)} articles",
                    flush=True,
                )

            except NewsSourceError as error:
                print(
                    f"[NEWS WARNING] {error}",
                    flush=True,
                )

    if successful_feeds == 0:
        raise NewsSourceError(
            f"All news sources failed for {category}."
        )

    # Alterner les médias afin de conserver plusieurs sources.
    selected = []
    seen_urls = set()
    max_size = max((len(batch) for batch in batches), default=0)

    for index in range(max_size):
        for batch in batches:
            if index >= len(batch):
                continue

            article = batch[index]

            if article["url"] in seen_urls:
                continue

            selected.append(article)
            seen_urls.add(article["url"])

            if len(selected) >= limit:
                return selected

    return selected