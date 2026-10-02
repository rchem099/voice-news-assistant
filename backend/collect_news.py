import argparse
import fcntl
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

from dotenv import load_dotenv

from services.news import fetch_news, NewsSourceError
from services.article_store import save_articles, ArticleStoreError


BACKEND_DIR = Path(__file__).resolve().parent

load_dotenv(BACKEND_DIR / ".env")

CATEGORIES = ("world", "middle_east", "business")
INTERVAL_SECONDS = 30 * 60


def collect_once():
    started_at = datetime.now(timezone.utc).isoformat()

    print(f"\nCollection started: {started_at}", flush=True)

    articles_by_url = {}
    failed_categories = []

    for category in CATEGORIES:
        try:
            articles = fetch_news(category, limit=50)

        except NewsSourceError as error:
            print(
                f"[ERROR] {category}: {error}",
                flush=True,
            )
            failed_categories.append(category)
            continue

        print(
            f"[OK] {category}: {len(articles)} articles",
            flush=True,
        )

        for article in articles:
            articles_by_url[article["url"]] = article

    if not articles_by_url:
        print(
            "No articles available to save. "
            "Check the feed results above.",
            flush=True,
        )
        return False

    try:
        saved_count = save_articles(
            list(articles_by_url.values())
        )

    except ArticleStoreError as error:
        print(f"[ERROR] {error}", flush=True)
        return False

    print(
        f"Saved or updated: {saved_count} distinct articles.",
        flush=True,
    )

    if failed_categories:
        print(
            "Partial collection: some feeds failed.",
            flush=True,
        )
        return False

    return True


def main():
    parser = argparse.ArgumentParser()

    parser.add_argument(
        "--watch",
        action="store_true",
        help="Collect every 30 minutes until stopped.",
    )

    args = parser.parse_args()

    # macOS: prevent two collectors from running simultaneously.
    lock_path = BACKEND_DIR / ".news-collector.lock"

    with lock_path.open("a") as lock_file:
        try:
            fcntl.flock(
                lock_file.fileno(),
                fcntl.LOCK_EX | fcntl.LOCK_NB,
            )

        except BlockingIOError:
            print("Another news collector is already running.")
            return 1

        if not args.watch:
            return 0 if collect_once() else 1

        print(
            "Automatic collection enabled: every 30 minutes. "
            "Press Ctrl+C to stop.",
            flush=True,
        )

        try:
            while True:
                collect_once()
                time.sleep(INTERVAL_SECONDS)

        except KeyboardInterrupt:
            print("\nCollector stopped.")
            return 0


if __name__ == "__main__":
    sys.exit(main())