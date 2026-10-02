begin;

-- =========================================================
-- 1. Create tables
-- =========================================================

-- One profile per user.
create table public.profiles (
    id uuid primary key
        references auth.users(id) on delete cascade,

    first_name text not null default '',
    language text not null default 'fr',
    timezone text not null default 'America/Toronto',
    created_at timestamptz not null default now()
);

-- One preferences record per user.
create table public.preferences (
    user_id uuid primary key
        references auth.users(id) on delete cascade,

    topics text[] not null
        default array['politics', 'economy']::text[],

    countries text[] not null
        default array['CA']::text[],

    briefing_duration_seconds integer not null default 180
        check (briefing_duration_seconds between 30 and 900),

    remember_history boolean not null default false,
    updated_at timestamptz not null default now()
);

-- Shared articles collected by the backend.
create table public.articles (
    id uuid primary key default gen_random_uuid(),
    title text not null,
    source_name text not null,
    url text not null unique,
    published_at timestamptz not null,
    fetched_at timestamptz not null default now(),
    content text
);

-- Personal briefings.
create table public.briefings (
    id uuid primary key default gen_random_uuid(),

    user_id uuid not null
        references auth.users(id) on delete cascade,

    period_start timestamptz not null,
    period_end timestamptz not null,
    summary_text text not null,

    status text not null default 'ready'
        check (
            status in ('ready', 'in_progress', 'completed')
        ),

    playback_position_seconds integer not null default 0
        check (playback_position_seconds >= 0),

    created_at timestamptz not null default now(),
    completed_at timestamptz,

    constraint valid_briefing_period
        check (period_end >= period_start),

    constraint valid_completion_state
        check (
            (
                status = 'completed'
                and completed_at is not null
            )
            or
            (
                status <> 'completed'
                and completed_at is null
            )
        ),

    -- Allows ownership to be checked by a composite foreign key.
    unique (id, user_id)
);

-- Articles included in a briefing.
create table public.briefing_items (
    id uuid primary key default gen_random_uuid(),

    briefing_id uuid not null
        references public.briefings(id) on delete cascade,

    article_id uuid not null
        references public.articles(id),

    position integer not null
        check (position >= 1),

    unique (briefing_id, position),
    unique (briefing_id, article_id)
);

-- Questions and answers saved with the user's permission.
create table public.interactions (
    id uuid primary key default gen_random_uuid(),

    user_id uuid not null
        references auth.users(id) on delete cascade,

    briefing_id uuid,
    question_text text not null,
    answer_text text not null,
    topic text,
    created_at timestamptz not null default now(),

    -- An interaction cannot reference another user's briefing.
    foreign key (briefing_id, user_id)
        references public.briefings(id, user_id)
        on delete cascade
);

-- =========================================================
-- 2. Create indexes
-- =========================================================

create index briefings_user_created_idx
    on public.briefings(user_id, created_at desc);

create index interactions_user_created_idx
    on public.interactions(user_id, created_at desc);

create index interactions_briefing_owner_idx
    on public.interactions(briefing_id, user_id);

create index articles_published_idx
    on public.articles(published_at desc);

create index briefing_items_article_idx
    on public.briefing_items(article_id);

-- =========================================================
-- 3. Enable row-level security
-- =========================================================

alter table public.profiles
    enable row level security;

alter table public.preferences
    enable row level security;

alter table public.articles
    enable row level security;

alter table public.briefings
    enable row level security;

alter table public.briefing_items
    enable row level security;

alter table public.interactions
    enable row level security;

-- =========================================================
-- 4. Configure table permissions
-- =========================================================

-- Remove default access for application clients.
revoke all on table
    public.profiles,
    public.preferences,
    public.articles,
    public.briefings,
    public.briefing_items,
    public.interactions
from public, anon, authenticated;

-- Signed-in users can manage their own personal records.
grant select, insert, update, delete on table
    public.profiles,
    public.preferences,
    public.briefings,
    public.briefing_items
to authenticated;

-- Saved interactions can be read, created, and deleted.
grant select, insert, delete on table
    public.interactions
to authenticated;

-- Shared articles are read-only for signed-in users.
grant select on table
    public.articles
to authenticated;

-- =========================================================
-- 5. Create ownership policies
-- =========================================================

-- Profile ownership.
create policy "Users manage their own profile"
on public.profiles
for all
to authenticated
using (
    (select auth.uid()) = id
)
with check (
    (select auth.uid()) = id
);

-- Preferences ownership.
create policy "Users manage their own preferences"
on public.preferences
for all
to authenticated
using (
    (select auth.uid()) = user_id
)
with check (
    (select auth.uid()) = user_id
);

-- Briefing ownership.
create policy "Users manage their own briefings"
on public.briefings
for all
to authenticated
using (
    (select auth.uid()) = user_id
)
with check (
    (select auth.uid()) = user_id
);

-- Access to briefing items follows ownership of the briefing.
create policy "Users manage items in their own briefings"
on public.briefing_items
for all
to authenticated
using (
    exists (
        select 1
        from public.briefings
        where briefings.id = briefing_items.briefing_id
          and briefings.user_id = (select auth.uid())
    )
)
with check (
    exists (
        select 1
        from public.briefings
        where briefings.id = briefing_items.briefing_id
          and briefings.user_id = (select auth.uid())
    )
);

-- Every signed-in user can read the shared articles.
create policy "Authenticated users read articles"
on public.articles
for select
to authenticated
using (true);

-- Users can read their own saved interactions.
create policy "Users read their own interactions"
on public.interactions
for select
to authenticated
using (
    (select auth.uid()) = user_id
);

-- Saving interactions requires ownership and enabled history.
create policy "Users save interactions when history is enabled"
on public.interactions
for insert
to authenticated
with check (
    (select auth.uid()) = user_id
    and exists (
        select 1
        from public.preferences
        where preferences.user_id = (select auth.uid())
          and preferences.remember_history = true
    )
);

-- Users can delete their own saved interactions.
create policy "Users delete their own interactions"
on public.interactions
for delete
to authenticated
using (
    (select auth.uid()) = user_id
);

commit;