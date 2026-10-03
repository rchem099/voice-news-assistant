begin;

alter table public.preferences
    add column if not exists explicit_weights jsonb
    not null default '{}'::jsonb;

create table if not exists public.interest_events (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references auth.users(id) on delete cascade,
    topic text not null check (
        topic in ('politics', 'economy', 'inflation')
    ),
    created_at timestamptz not null default now()
);

create index if not exists interest_events_user_date_idx
    on public.interest_events(user_id, created_at desc);

alter table public.interest_events enable row level security;

revoke all on public.interest_events from public, anon, authenticated;
grant select, insert, delete on public.interest_events to authenticated;

create policy "Users read their interest events"
on public.interest_events for select to authenticated
using (user_id = (select auth.uid()));

create policy "Users delete their interest events"
on public.interest_events for delete to authenticated
using (user_id = (select auth.uid()));

create policy "Users record interests with consent"
on public.interest_events for insert to authenticated
with check (
    user_id = (select auth.uid())
    and exists (
        select 1 from public.preferences
        where user_id = (select auth.uid())
          and remember_history = true
    )
);

create or replace function public.manage_interest_memory(
    p_action text,
    p_topic text default null,
    p_weight integer default null
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
    v_user uuid := auth.uid();
    v_preferences public.preferences%rowtype;
    v_counts jsonb;
begin
    if v_user is null then
        raise exception 'Authentication required';
    end if;

    if p_action not in (
        'status', 'enable', 'disable', 'clear', 'set', 'record'
    ) then
        raise exception 'Invalid action';
    end if;

    insert into public.preferences(user_id)
    values (v_user)
    on conflict (user_id) do nothing;

    -- Sérialiser les changements de consentement et les enregistrements.
    select * into v_preferences
    from public.preferences
    where user_id = v_user
    for update;

    if p_action = 'enable' then
        update public.preferences
        set remember_history = true, updated_at = now()
        where user_id = v_user;

    elsif p_action = 'disable' then
        update public.preferences
        set remember_history = false, updated_at = now()
        where user_id = v_user;

    elsif p_action = 'clear' then
        delete from public.interest_events where user_id = v_user;
        delete from public.interactions where user_id = v_user;

        update public.preferences
        set remember_history = false,
            explicit_weights = '{}'::jsonb,
            updated_at = now()
        where user_id = v_user;

        update public.profiles
        set last_conversation_topic = null,
            last_conversation_at = null
        where id = v_user;

    elsif p_action = 'set' then
        if p_topic is null
           or p_topic not in ('politics', 'economy', 'inflation')
           or p_weight is null
           or p_weight not in (-3, 3) then
            raise exception 'Invalid preference';
        end if;

        update public.preferences
        set explicit_weights = jsonb_set(
                explicit_weights,
                array[p_topic],
                to_jsonb(p_weight),
                true
            ),
            updated_at = now()
        where user_id = v_user;

    elsif p_action = 'record' and v_preferences.remember_history then
        if p_topic is null
           or p_topic not in ('politics', 'economy', 'inflation') then
            raise exception 'Invalid topic';
        end if;

        insert into public.interest_events(user_id, topic)
        values (v_user, p_topic);

        update public.profiles
        set last_conversation_topic = p_topic,
            last_conversation_at = now()
        where id = v_user;
    end if;

    select * into v_preferences
    from public.preferences
    where user_id = v_user;

    select coalesce(
        jsonb_object_agg(topic, occurrences),
        '{}'::jsonb
    )
    into v_counts
    from (
        select topic, count(*) as occurrences
        from public.interest_events
        where user_id = v_user
          and created_at >= now() - interval '30 days'
        group by topic
    ) as totals;

    return jsonb_build_object(
        'enabled', v_preferences.remember_history,
        'explicit_weights', v_preferences.explicit_weights,
        'counts',
            case when v_preferences.remember_history
                then v_counts
                else '{}'::jsonb
            end
    );
end;
$$;

revoke all on function public.manage_interest_memory(
    text, text, integer
) from public, anon;

grant execute on function public.manage_interest_memory(
    text, text, integer
) to authenticated;

commit;