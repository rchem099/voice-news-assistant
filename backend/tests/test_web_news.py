import unittest
from datetime import date, datetime
from types import SimpleNamespace
from unittest.mock import patch, MagicMock
from zoneinfo import ZoneInfo

from services import web_news as news

NOW = datetime(2026, 11, 1, 12, tzinfo=ZoneInfo('America/Toronto'))


class WebNewsTests(unittest.TestCase):
    def period(self, explicit=False):
        return news.Period(explicit=explicit, start=date(2026, 11, 1), end=date(2026, 11, 1))

    @patch.object(news, 'retrieve')
    @patch.object(news, 'generate_structured')
    def test_default_success_does_not_expand(self, generate, retrieve):
        generate.return_value = self.period()
        retrieve.return_value = [(news.Story(summary='Un fait vérifié.',
            url='https://example.org/news', published=date(2026, 10, 31)), 'Titre')]
        result = news.answer_from_web('News?', [], None, now=NOW)
        self.assertEqual(retrieve.call_count, 1)
        self.assertEqual(result['search_period']['start'], '2026-10-26')
        self.assertIn('example.org', result['answer'])
        self.assertIn('31 October 2026', result['answer'])
        self.assertEqual(result['sources'][0]['url'], 'https://example.org/news')

    @patch.object(news, 'retrieve', return_value=[])
    @patch.object(news, 'generate_structured')
    def test_empty_default_expands_and_announces(self, generate, retrieve):
        generate.return_value = self.period()
        result = news.answer_from_web('News?', [], None, now=NOW)
        self.assertEqual(retrieve.call_count, 2)
        self.assertEqual(result['search_period']['start'], '2026-10-03')
        self.assertIn('past thirty days', result['answer'])

    @patch.object(news, 'retrieve', return_value=[])
    @patch.object(news, 'generate_structured')
    def test_today_never_expands(self, generate, retrieve):
        generate.return_value = self.period(True)
        result = news.answer_from_web('Aujourd’hui ?', [], None, now=NOW)
        self.assertEqual(retrieve.call_count, 1)
        self.assertFalse(result['search_period']['expanded'])
        self.assertEqual(result['search_period']['start'], '2026-11-01')

    @patch.object(news, 'search_web')
    @patch.object(news, 'generate_structured')
    def test_unreturned_urls_and_old_dates_are_rejected(self, generate, search):
        search.return_value = ('Report', {'https://example.org/news': 'Title'})
        generate.return_value = news.Findings(stories=[
            news.Story(summary='Fake URL', url='https://invented.org', published=date(2026, 11, 1)),
            news.Story(summary='Old', url='https://example.org/news', published=date(2020, 1, 1))])
        self.assertEqual(news.retrieve({}, date(2026, 10, 26), date(2026, 11, 1)), [])

    @patch.object(news, 'OpenAI')
    @patch.dict('os.environ', {'OPENAI_API_KEY': 'test-only'})
    def test_search_must_really_execute(self, client):
        response = MagicMock(status='completed')
        response.model_dump.return_value = {'output': []}
        create = client.return_value.__enter__.return_value.responses.create
        create.return_value = response
        with self.assertRaises(news.GenerationError):
            news.search_web({}, date(2026, 11, 1), date(2026, 11, 1))
        self.assertEqual(create.call_args.kwargs['tool_choice'], 'required')
        self.assertEqual(create.call_args.kwargs['tools'][0]['type'], 'web_search')

    @patch.object(news, 'retrieve', side_effect=news.GenerationError('unavailable'))
    @patch.object(news, 'generate_structured')
    def test_search_failure_does_not_trigger_wider_search(self, generate, retrieve):
        generate.return_value = self.period()
        with self.assertRaises(news.GenerationError):
            news.answer_from_web('News?', [], None, now=NOW)
        self.assertEqual(retrieve.call_count, 1)

    def test_unsafe_urls(self):
        for url in ['javascript:alert(1)', 'https://', 'https://user:password@example.org']:
            self.assertFalse(news.safe_url(url))


if __name__ == '__main__':
    unittest.main()
