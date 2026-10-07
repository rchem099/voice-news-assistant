begin;

alter table public.articles
    add column first_seen_at timestamptz,
    add column news_updated_at timestamptz;

-- Approximate baseline for articles already collected.
update public.articles
set
    first_seen_at = fetched_at,
    news_updated_at = published_at;

alter table public.articles
    alter column first_seen_at set default now(),
    alter column first_seen_at set not null,
    alter column news_updated_at set default now(),
    alter column news_updated_at set not null;

create function public.track_article_changes()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
    -- Preserve the original arrival date.
    new.first_seen_at := old.first_seen_at;

    if row(
        new.title,
        new.rss_description,
        new.content,
        new.published_at
    ) is distinct from row(
        old.title,
        old.rss_description,
        old.content,
        old.published_at
    ) then
        new.news_updated_at := now();
    else
        new.news_updated_at := old.news_updated_at;
    end if;

    return new;
end;
$$;

create trigger track_article_changes
before update on public.articles
for each row
execute function public.track_article_changes();

create index articles_first_seen_idx
    on public.articles(first_seen_at);

create index articles_news_updated_idx
    on public.articles(news_updated_at);

commit;