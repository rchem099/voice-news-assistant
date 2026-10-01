# Data Model

## Accounts: auth.users

Managed by Supabase Auth.
Stores account information, including the user ID and email address.
The application does not create its own password column.

## profiles Table

One profile per user.

- id: Supabase user ID
- first_name: user's first name
- language: preferred language
- timezone: user's time zone
- created_at: creation date and time

## preferences Table

One preferences record per user.

- user_id: Supabase user ID
- topics: list of followed topics
- countries: list of followed countries
- briefing_duration_seconds: preferred briefing duration in seconds
- remember_history: permission to store questions and answers
- updated_at: date and time of the last update

## articles Table

Articles available for generating briefings.
Articles are shared across users.

- id: article ID
- title: article title
- source_name: name of the source
- url: link to the article
- published_at: publication date and time
- fetched_at: retrieval date and time
- content: article content that the provider permits storing

## briefings Table

Briefings prepared for a user.

- id: briefing ID
- user_id: Supabase user ID
- period_start: start of the covered period
- period_end: end of the covered period
- summary_text: briefing text
- status: ready, in_progress, or completed
- playback_position_seconds: playback position in seconds
- created_at: creation date and time
- completed_at: completion date and time; null until listening is completed

## briefing_items Table

Articles included in each briefing.

- id: briefing item ID
- briefing_id: associated briefing ID
- article_id: associated article ID
- position: presentation order within the briefing

## interactions Table

Questions and answers stored with the user's permission.

- id: interaction ID
- user_id: Supabase user ID
- briefing_id: associated briefing ID; optional
- question_text: transcribed question
- answer_text: response text
- topic: topic discussed
- created_at: date and time of the interaction

## Rules

- Each account has at most one profile.
- Each account has one preferences record.
- Each briefing belongs to a user.
- Each interaction belongs to a user.
- Articles can be used in briefings for multiple users.
- Users cannot access another user's personal data.
- A briefing is marked as completed only when playback finishes.
- Questions and answers are stored only when history recording is enabled.