begin;

-- English is the default for new profiles.
alter table public.profiles
    alter column language set default 'en';

-- Has the first introduction already been delivered?
alter table public.profiles
    add column onboarding_completed boolean
    not null default false;

-- Optional memory used for the next greeting.
alter table public.profiles
    add column last_conversation_topic text;

alter table public.profiles
    add column last_conversation_at timestamptz;

commit;