# Voice News Assistant

An English-speaking AI news assistant built with React, Flask, and local AI models.

Ask questions by voice, listen to spoken answers, and optionally let the assistant remember your news interests.

## Live demo

[Open Voice News Assistant](https://among-surrounding-breakdown-medal.trycloudflare.com)

**This is a temporary demo hosted on the developer's Mac.**

- The application is available only while the Mac, backend, Ollama, and Cloudflare tunnel are running.
- The address changes when the tunnel is recreated.
- Sign-in is required. New registrations depend on the email confirmation service being configured.
- Allow microphone access and click **Play voice** if automatic playback is blocked.

## Features

- Email and password authentication through Supabase.
- English voice recording and local speech transcription.
- AI answers based on selected news excerpts.
- Spoken responses using browser speech synthesis.
- Source links associated with answers.
- Personalized news briefings and listening progress.
- Optional memory of news interests.
- Voice commands for managing preferences and memory.

The current prototype uses buttons to start and stop recording. Fully hands-free conversation is not implemented yet.

## News sources

Configured RSS sources include:

- BBC News
- The Guardian
- Al Jazeera English
- Deutsche Welle
- France 24
- CBC News
- Morocco World News

Coverage depends on feed availability and publication dates. The assistant reads RSS excerpts rather than searching the entire web.

A response may use only one publisher when its articles are the most relevant.

## Technology

| Component | Technology |
|---|---|
| Frontend | React, TypeScript, Vite |
| Backend | Flask |
| Authentication and database | Supabase / PostgreSQL |
| Local language model | Ollama with Qwen3 |
| Speech recognition | faster-whisper |
| Audio decoding | FFmpeg through imageio-ffmpeg |
| Speech synthesis | Browser Web Speech API |
| Demo server | Waitress |
| Public HTTPS access | Cloudflare Tunnel |

## Project structure

```text
voice-news-assistant/
├── backend/
│   ├── app.py
│   ├── auth.py
│   ├── questions.py
│   ├── listening.py
│   ├── public_app.py
│   ├── collect_news.py
│   ├── requirements.txt
│   └── services/
├── frontend/
│   ├── src/
│   ├── public/
│   └── package.json
├── database/
└── README.md
```

## Local development

### Prerequisites

- Python 3.12
- Node.js and npm
- Ollama
- A configured Supabase project

Apply the SQL migrations in the `database` directory in their intended order when setting up a new database. Some migrations may not support repeated execution.

### Environment variables

Create `frontend/.env`:

```dotenv
VITE_SUPABASE_URL=YOUR_SUPABASE_PROJECT_URL
VITE_SUPABASE_PUBLISHABLE_KEY=YOUR_SUPABASE_PUBLISHABLE_KEY
```

Create `backend/.env`:

```dotenv
SUPABASE_URL=YOUR_SUPABASE_PROJECT_URL
SUPABASE_PUBLISHABLE_KEY=YOUR_SUPABASE_PUBLISHABLE_KEY
OLLAMA_URL=http://localhost:11434
OLLAMA_MODEL=qwen3:4b
```

The news collector may require additional server-side database credentials configured for the project.

Never commit `.env` files or place a Supabase service-role key in frontend code.

### Start Ollama

Open the Ollama application, then download the model if needed:

```bash
ollama pull qwen3:4b
```

### Start the backend

From the project root:

```bash
cd backend
python3.12 -m venv .venv312
source .venv312/bin/activate
python -m pip install -r requirements.txt
python -m flask --app app run --port 5001
```

If `.venv312` already exists, activate it without recreating it.

### Start the frontend

In another terminal, from the project root:

```bash
cd frontend
npm install
npm run dev -- --port 5173 --strictPort
```

Open [the local application](http://localhost:5173/).

This address works only on the computer running the frontend.

## Collect news

From the `backend` directory, with the virtual environment activated:

```bash
python collect_news.py
```

To collect every 30 minutes:

```bash
python collect_news.py --watch
```

Keep the collector running while scheduled collection is needed.

## Run the built application

Build the frontend:

```bash
cd frontend
npm run build
```

Then start the combined frontend and backend server:

```bash
cd ../backend
source .venv312/bin/activate
waitress-serve --host=127.0.0.1 --port=8080 --threads=4 public_app:app
```

Open [the built application locally](http://localhost:8080/).

For this mode, the separate Vite development server is not required.

## Share a temporary public demo

With `cloudflared` installed and the server running on port 8080:

```bash
cloudflared tunnel --url http://127.0.0.1:8080
```

On the developer's Mac, the installed executable can also be launched with:

```bash
"$HOME/Applications/voice-news-tools/cloudflared" tunnel --url http://127.0.0.1:8080
```

Use the HTTPS address printed in the terminal.

Update the Supabase Site URL and allowed redirect URLs when the demo address changes. Keep the tunnel, application server, and Ollama running.

## Example questions

- “What are the latest economic headlines?”
- “What is happening in Morocco?”
- “Explain the second topic of the briefing.”
- “What has changed since yesterday?”

## Memory commands

- “Remember my interests.”
- “Show my preferences.”
- “Less politics.”
- “Disable memory.”
- “Forget my history.”

Interest tracking requires consent. Disabling memory stops inferred-interest tracking; explicit preferences remain until cleared.

## Limitations

- Local AI generation can take time, especially on an Intel Mac.
- The current application waits for the complete generated answer before speaking.
- Voice quality and available voices depend on the browser and device.
- RSS feeds can be unavailable or omit a requested topic.
- AI answers can contain mistakes; consult the linked sources.
- This prototype is not designed for a large number of simultaneous users.
- The public demo URL is temporary and is not permanent hosting.