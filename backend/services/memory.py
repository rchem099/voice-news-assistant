import re

import requests


class MemoryError(Exception):
    pass


TOPIC_WORDS = {
    "inflation": ["inflation", "prices", "cost of living"],
    "economy": ["economy", "economic", "business", "trade", "jobs"],
    "politics": ["politics", "political", "election", "parliament"],
}


def memory_call(url, headers, action="status", topic=None, weight=None):
    try:
        response = requests.post(
            f"{url}/rest/v1/rpc/manage_interest_memory",
            headers=headers,
            json={
                "p_action": action,
                "p_topic": topic,
                "p_weight": weight,
            },
            timeout=15,
        )
        if not response.ok:
            print(
                f"Memory database error: "
                f"{response.status_code} — {response.text}",
                flush=True,
            )        
        response.raise_for_status()
        result = response.json()
    except (requests.RequestException, ValueError) as error:
        raise MemoryError("Unable to update or read memory.") from error

    if not isinstance(result, dict):
        raise MemoryError("Invalid memory response.")

    return result


def detect_topic(question):
    text = question.casefold()

    for topic, words in TOPIC_WORDS.items():
        if any(
            re.search(r"\b" + re.escape(word) + r"\b", text)
            for word in words
        ):
            return topic

    return None


def handle_memory_command(question, url, headers):
    text = re.sub(r"[^\w\s]", "", question.casefold())
    text = " ".join(text.split())

    actions = {
        "remember my interests": "enable",
        "enable memory": "enable",
        "disable memory": "disable",
        "show my preferences": "status",
        "forget my history": "clear",
    }

    action = actions.get(text)
    topic = None
    weight = None

    match = re.fullmatch(
        r"(more|less) (politics|economy|inflation)", text
    )

    if match:
        action = "set"
        topic = match.group(2)
        weight = 3 if match.group(1) == "more" else -3

    if action is None:
        return None

    state = memory_call(url, headers, action, topic, weight)

    if action == "enable":
        answer = (
            "Memory is enabled. I will save topic names and dates, "
            "not your audio recordings or full transcripts."
        )
    elif action == "disable":
        answer = (
            "Memory is disabled. I will stop saving and using inferred "
            "interests. Your explicit preferences remain in place."
        )
    elif action == "clear":
        answer = (
            "Your saved interest history and voice preference weights "
            "have been cleared, and memory is disabled. "
            "Your briefings and listening progress have been kept."
        )
    elif action == "set":
        direction = "higher" if weight > 0 else "lower"
        answer = f"I saved a {direction} priority for {topic}."
    else:
        explicit = ", ".join(
            f"{key}: {'more' if value > 0 else 'less'}"
            for key, value in state["explicit_weights"].items()
        ) or "none"

        inferred = ", ".join(
            f"{key}: {value} questions"
            for key, value in state["counts"].items()
        ) or "none"

        answer = (
            f"Memory is {'enabled' if state['enabled'] else 'disabled'}. "
            f"Explicit preferences: {explicit}. "
            f"Recent inferred interests: {inferred}."
        )

    return {
        "answer": answer,
        "sources": [],
        "clear_context": action in ("disable", "clear"),
    }


def interest_score(article, preferences, state):
    text = (
        article.get("title", "") + " " +
        (article.get("rss_description") or "")
    ).casefold()

    score = 0

    for topic, words in TOPIC_WORDS.items():
        if not any(
            re.search(r"\b" + re.escape(word) + r"\b", text)
            for word in words
        ):
            continue

        explicit = state.get("explicit_weights", {})

        if topic in explicit:
            # Un choix explicite remplace l'inférence sur ce thème.
            score += explicit[topic] * 10
        else:
            if topic in (preferences.get("topics") or []):
                score += 2

            if state.get("enabled"):
                count = state.get("counts", {}).get(topic, 0)
                score += min(count, 5)

    return score