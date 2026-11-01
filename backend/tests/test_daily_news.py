import unittest
from datetime import datetime, timezone
from unittest.mock import patch
from services import daily_news as daily

NOW = datetime(2026, 11, 1, 2, tzinfo=timezone.utc)


class DailyTests(unittest.TestCase):
    def test_explicit_negative_overrides_inference(self):
        self.assertEqual(daily.saved_interests({'topics': ['politics', 'economy']}, {
            'enabled': True, 'explicit_weights': {'politics': -3, 'inflation': 3},
            'counts': {'politics': 9}}), ['economy', 'inflation'])

    def test_disabled_memory(self):
        self.assertEqual(daily.saved_interests({}, {
            'enabled': False, 'counts': {'politics': 5}}), [])

    @patch.object(daily, 'search_web')
    @patch.object(daily, 'memory_call', return_value={'enabled': False})
    @patch.object(daily, 'read_rows', side_effect=[[], []])
    def test_no_interests_does_not_search(self, rows, memory, search):
        result = daily.build_daily_news('db', {}, 'user', now=NOW)
        self.assertEqual(result['action'], 'no_interests')
        search.assert_not_called()
        self.assertEqual(rows.call_args_list[0].args[3]['id'], 'eq.user')
        self.assertEqual(rows.call_args_list[1].args[3]['user_id'], 'eq.user')

    @patch.object(daily, 'generate_written_briefing')
    @patch.object(daily, 'generate_structured')
    @patch.object(daily, 'search_web', return_value=('Report', {'https://example.org/news': 'Title'}))
    @patch.object(daily, 'memory_call', return_value={'enabled': False})
    @patch.object(daily, 'read_rows', side_effect=[[{'timezone': 'America/Toronto'}], [{'topics': ['economy']}]])
    def test_local_today_and_source_filters(self, rows, memory, search, extract, draft):
        extract.return_value = daily.DailyEvidence(stories=[
            daily.DailyStory(summary='Old', url='https://example.org/news', published='2026-10-30'),
            daily.DailyStory(summary='Unknown', url='https://invented.org', published='2026-10-31')])
        result = daily.build_daily_news('db', {}, 'user', now=NOW)
        self.assertEqual(str(search.call_args.args[1]), '2026-10-31')
        self.assertEqual(search.call_args.args[1], search.call_args.args[2])
        self.assertEqual(result['action'], 'no_articles')
        draft.assert_not_called()

    @patch.object(daily, 'generate_written_briefing')
    @patch.object(daily, 'generate_structured')
    @patch.object(daily, 'search_web', return_value=('Report', {'https://example.org/news': 'Title'}))
    @patch.object(daily, 'memory_call', return_value={'enabled': False, 'explicit_weights': {'inflation': 3}})
    @patch.object(daily, 'read_rows', side_effect=[[], []])
    def test_five_minute_target_and_short_coverage(self, rows, memory, search, extract, draft):
        extract.return_value = daily.DailyEvidence(stories=[daily.DailyStory(
            summary='Verified update.', url='https://example.org/news', published='2026-10-31')])
        source = {'id': 'D1', 'url': 'https://example.org/news'}
        draft.return_value = {'spoken_text': 'A short briefing.', 'estimated_seconds': 20,
                              'topics': [{'sources': [source]}]}
        result = daily.build_daily_news('db', {}, 'user', now=NOW)
        self.assertEqual(draft.call_args.args[1]['preferences_used']['briefing_duration_seconds'], 300)
        self.assertEqual(result['interests']['topics'], ['inflation'])
        self.assertIn('shorter than five minutes', result['spoken_text'])
        self.assertEqual(result['sources'], [source])

    @patch.object(daily, 'daily_articles', return_value=[])
    @patch.object(daily, 'memory_call', return_value={'explicit_weights': {'economy': 3}})
    @patch.object(daily, 'read_rows', side_effect=[[], []])
    def test_strict_today_offers_expansion_without_searching_older_dates(self, rows, memory, articles):
        result = daily.build_daily_news('db', {}, 'user', now=NOW)
        self.assertEqual(articles.call_count, 1)
        self.assertTrue(result['can_expand'])
        self.assertFalse(result['search_period']['expanded'])

    @patch.object(daily, 'daily_articles', return_value=[])
    @patch.object(daily, 'memory_call', return_value={'explicit_weights': {'economy': 3}})
    @patch.object(daily, 'read_rows', side_effect=[[], []])
    def test_opted_in_expansion_searches_seven_then_thirty_days(self, rows, memory, articles):
        result = daily.build_daily_news('db', {}, 'user', now=NOW, allow_expansion=True)
        self.assertEqual(articles.call_count, 3)
        starts = [str(call.args[1]) for call in articles.call_args_list]
        self.assertEqual(starts, ['2026-10-31', '2026-10-25', '2026-10-02'])
        self.assertFalse(result['can_expand'])
        self.assertEqual(result['search_period']['start'], '2026-10-02')

    @patch.object(daily, 'generate_written_briefing')
    @patch.object(daily, 'daily_articles', side_effect=[[], [{'id': 'D1'}]])
    @patch.object(daily, 'memory_call', return_value={'explicit_weights': {'economy': 3}})
    @patch.object(daily, 'read_rows', side_effect=[[], []])
    def test_expanded_briefing_announces_its_actual_period(self, rows, memory, articles, draft):
        draft.return_value = {'spoken_text': 'Verified news.', 'estimated_seconds': 300, 'topics': []}
        result = daily.build_daily_news('db', {}, 'user', now=NOW, allow_expansion=True)
        self.assertEqual(articles.call_count, 2)
        self.assertIn('past 7 days', result['spoken_text'])
        self.assertIn('not necessarily published today', result['spoken_text'])
        self.assertEqual(draft.call_args.args[0]['period_start'], '2026-10-25')


if __name__ == '__main__':
    unittest.main()
