import unittest
from unittest.mock import patch

from app import main


class ModelHealthTests(unittest.IsolatedAsyncioTestCase):
    def test_placeholder_api_keys_are_rejected(self):
        self.assertFalse(main._is_api_key_configured(""))
        self.assertFalse(main._is_api_key_configured("your-api-key-here"))
        self.assertFalse(main._is_api_key_configured("replace-with-your-api-key"))
        self.assertTrue(main._is_api_key_configured("sk-valid-test-key"))

    async def test_global_api_config_is_used_as_fallback(self):
        with patch.multiple(
            main.settings,
            OPENAI_API_KEY="sk-valid-test-key",
            OPENAI_BASE_URL="https://api.example.com/v1",
            POLISH_MODEL="polish-model",
            POLISH_API_KEY=None,
            POLISH_BASE_URL=None,
            ENHANCE_MODEL="enhance-model",
            ENHANCE_API_KEY=None,
            ENHANCE_BASE_URL=None,
            EMOTION_MODEL=None,
        ):
            result = await main.check_models_health()

        self.assertEqual(result["overall_status"], "healthy")
        self.assertEqual(
            result["models"]["polish"]["base_url"],
            "https://api.example.com/v1",
        )
        self.assertEqual(
            result["models"]["enhance"]["base_url"],
            "https://api.example.com/v1",
        )


if __name__ == "__main__":
    unittest.main()
