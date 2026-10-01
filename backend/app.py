from flask import Flask, jsonify

app = Flask(__name__)


@app.route("/api/health", methods=["GET"])
def health():
    return jsonify({"ok": True})