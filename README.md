# Voice News Assistant

An English-speaking AI news assistant built with React, Flask, and local AI models.

Ask questions by voice, listen to spoken answers, and optionally let the assistant remember your news interests.

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
## Questions d’actualité : recherche web

Le parcours des questions utilise désormais l’API OpenAI Responses avec
`web_search` obligatoire, sans filtre limitant la recherche à un média.
`OPENAI_SEARCH_MODEL` permet de choisir le modèle de recherche ; sinon le
modèle `OPENAI_MODEL` est utilisé (par défaut `gpt-4.1-mini`, compatible).
Un échec de recherche ou un modèle incompatible bloque la réponse : aucun
repli sur les connaissances du modèle ou les anciens flux RSS.

Sans période explicite, la recherche porte sur sept dates calendaires,
aujourd’hui compris. Sans nouvelle pertinente datée et citée, elle est
relancée sur trente dates calendaires et cet élargissement est annoncé
oralement et affiché. Les périodes explicites ne sont jamais élargies.
Les dates relatives sont interprétées dans le fuseau America/Toronto.

Chaque nouvelle est présentée en anglais avec le domaine de la source
et sa date de publication. Les liens et titres viennent des annotations
de citation de l’outil web ; les URL proposées uniquement par la génération
sont rejetées. Les liens sont affichés dans le volet Sources existant.
La lecture conserve la sélection de voix anglaise d’origine : Google US
English en priorité, puis Reed en-US. Les réponses et les bulletins sont en anglais.

La transcription reste locale et inchangée : `faster-whisper`, `base.en`,
questions vocales en anglais. Les réponses aux questions sont en anglais.
L’audio n’est pas envoyé à OpenAI ; la question transcrite et son contexte
conversationnel sont transmis pour la recherche et la rédaction.

Limites : la recherche n’est pas exhaustive. La pertinence, la fiabilité,
l’interprétation des périodes explicites et l’extraction des dates sont
évaluées par le modèle. Les dates extraites sont filtrées côté serveur,
mais leur exactitude sémantique et les faits ne peuvent pas être garantis
par ce filtrage. La recherche web ne fournit pas ici de filtre temporel
strict : les bornes sont transmises aux instructions, puis contrôlées sur
les résultats extraits. Les pages sans date vérifiable sont exclues.
Plusieurs appels OpenAI sont nécessaires, avec coût et latence supplémentaires.

Validation locale (sans appels OpenAI ni Supabase) :

```sh
cd backend
python -m unittest discover -s tests -v
cd ../frontend
npm run build
npm run lint
```
