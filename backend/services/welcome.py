from datetime import datetime, timedelta
from zoneinfo import ZoneInfo


FIRST_WELCOME = (
    "Hi, I'm your personal news assistant. "
    "What topics or parts of the world interest you?"
)


def build_welcome(
    onboarding_completed: bool,
    previous_topic: str | None = None,
    previous_conversation_at: str | None = None,
    timezone_name: str = "UTC",
) -> str:
    """Build an English greeting using saved conversation information."""

    if not onboarding_completed:
        return FIRST_WELCOME

    invitation = (
        "Would you like a quick update on what's happened "
        "since your last visit?"
    )

    if not previous_topic or not previous_topic.strip():
        return f"Welcome back! {invitation}"

    when = "last time"

    if previous_conversation_at:
        try:
            timezone = ZoneInfo(timezone_name)

            previous = datetime.fromisoformat(
                previous_conversation_at.replace("Z", "+00:00")
            )

            # Database timestamps must include a timezone.
            if previous.tzinfo is not None:
                previous_date = previous.astimezone(timezone).date()
                today = datetime.now(timezone).date()

                if previous_date == today - timedelta(days=1):
                    when = "yesterday"

        except (ValueError, KeyError):
            # If a date or timezone is invalid, avoid an inaccurate date.
            when = "last time"

    topic = previous_topic.strip()

    return (
        f"Welcome back! It was great talking with you "
        f"about {topic} {when}. {invitation}"
    )