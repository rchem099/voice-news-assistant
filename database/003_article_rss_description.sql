begin;

alter table public.articles
    add column rss_description text;

-- The server-side collector can read, insert and update articles.
grant select, insert, update
on public.articles
to service_role;

commit;