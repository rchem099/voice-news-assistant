from pathlib import Path

from flask import abort, send_from_directory

from app import app


FRONTEND_DIST = (
    Path(__file__).resolve().parent.parent
    / "frontend"
    / "dist"
).resolve()

if not (FRONTEND_DIST / "index.html").is_file():
    raise RuntimeError(
        "Frontend build missing. Run npm run build "
        "inside the frontend directory."
    )

app.config["DEBUG"] = False


@app.get("/")
def frontend_home():
    response = send_from_directory(
        str(FRONTEND_DIST),
        "index.html",
    )
    response.headers["Cache-Control"] = "no-cache"
    return response


@app.get("/<path:requested_path>")
def frontend_file(requested_path):
    # Une route API inexistante doit rester une erreur 404.
    if requested_path == "api" or requested_path.startswith("api/"):
        abort(404)

    candidate = (FRONTEND_DIST / requested_path).resolve()

    # Ne servir que les fichiers du build React.
    if not candidate.is_relative_to(FRONTEND_DIST):
        abort(404)

    if candidate.is_file():
        return send_from_directory(
            str(FRONTEND_DIST),
            requested_path,
        )

    # Un fichier statique absent ne doit pas recevoir du HTML.
    if (
        requested_path.startswith("assets/")
        or Path(requested_path).suffix
    ):
        abort(404)

    # Permettre les routes internes de React.
    response = send_from_directory(
        str(FRONTEND_DIST),
        "index.html",
    )
    response.headers["Cache-Control"] = "no-cache"
    return response