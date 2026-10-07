from functools import wraps
from time import perf_counter


def timed(label):
    def decorate(function):
        @wraps(function)
        def wrapped(*args, **kwargs):
            started = perf_counter()

            try:
                return function(*args, **kwargs)
            finally:
                elapsed = perf_counter() - started

                print(
                    f"[TIMING] {label}: {elapsed:.2f} seconds",
                    flush=True,
                )

        return wrapped

    return decorate