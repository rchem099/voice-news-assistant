begin;

create or replace function public.save_ready_briefing(
    p_period_start timestamptz,
    p_period_end timestamptz,
    p_summary text,
    p_article_ids uuid[]
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
    v_user uuid := auth.uid();
    v_briefing public.briefings%rowtype;
begin
    if v_user is null then
        raise exception 'Authentication required';
    end if;

    if p_summary is null
       or length(trim(p_summary)) = 0
       or length(p_summary) > 40000
       or p_period_start is null
       or p_period_end is null
       or p_period_end < p_period_start
       or coalesce(cardinality(p_article_ids), 0) = 0 then
        raise exception 'Invalid briefing';
    end if;

    -- Sérialiser les sauvegardes pour cet utilisateur.
    perform pg_catalog.pg_advisory_xact_lock(
        pg_catalog.hashtextextended(v_user::text, 0)
    );

    -- Réutiliser un bulletin déjà en attente.
    select *
    into v_briefing
    from public.briefings
    where user_id = v_user
      and status in ('ready', 'in_progress')
    order by
        case when status = 'in_progress' then 0 else 1 end,
        created_at desc
    limit 1;

    if found then
        return to_jsonb(v_briefing);
    end if;

    insert into public.briefings (
        user_id,
        period_start,
        period_end,
        summary_text,
        status
    )
    values (
        v_user,
        p_period_start,
        p_period_end,
        p_summary,
        'ready'
    )
    returning * into v_briefing;

    insert into public.briefing_items (
        briefing_id,
        article_id,
        position
    )
    select
        v_briefing.id,
        article_id,
        row_number() over (order by article_id)::integer
    from (
        select distinct unnest(p_article_ids) as article_id
    ) as unique_articles;

    return to_jsonb(v_briefing);
end;
$$;

revoke all on function public.save_ready_briefing(
    timestamptz, timestamptz, text, uuid[]
) from public, anon;

grant execute on function public.save_ready_briefing(
    timestamptz, timestamptz, text, uuid[]
) to authenticated;

commit;