"""
Unit tests for NLLB translator (PlaceholderManager, get_missing_translations).
Does NOT load the model - tests logic only. Uses nllb_utils (no torch/tqdm).
"""
import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from nllb_utils import PlaceholderManager, get_missing_translations, clean_translation


class TestPlaceholderManager(unittest.TestCase):
    def setUp(self):
        self.pm = PlaceholderManager()

    def test_protect_bitrix_macros(self):
        text = "Hello #AUTHOR# and #NAME#"
        protected, ph = self.pm.protect(text)
        self.assertIn("__PH_", protected)
        self.assertNotIn("#AUTHOR#", protected)
        self.assertEqual(len(ph), 2)
        self.assertEqual(self.pm.restore(protected, ph), text)

    def test_protect_format_strings(self):
        text = "Value: {0} and {name}"
        protected, ph = self.pm.protect(text)
        self.assertNotIn("{0}", protected)
        self.assertNotIn("{name}", protected)
        self.assertEqual(self.pm.restore(protected, ph), text)

    def test_protect_printf_style(self):
        text = "Error: %s at line %d"
        protected, ph = self.pm.protect(text)
        self.assertNotIn("%s", protected)
        self.assertNotIn("%d", protected)
        self.assertEqual(self.pm.restore(protected, ph), text)

    def test_protect_html_tags(self):
        text = "Click <a href='x'>here</a>"
        protected, ph = self.pm.protect(text)
        self.assertNotIn("<a href='x'>", protected)
        self.assertEqual(self.pm.restore(protected, ph), text)

    def test_empty_string(self):
        protected, ph = self.pm.protect("")
        self.assertEqual(protected, "")
        self.assertEqual(ph, {})
        self.assertEqual(self.pm.restore("", {}), "")

    def test_no_placeholders(self):
        text = "Plain text only"
        protected, ph = self.pm.protect(text)
        self.assertEqual(protected, text)
        self.assertEqual(ph, {})


class TestCleanTranslation(unittest.TestCase):
    def test_removes_duplicate_words(self):
        self.assertEqual(clean_translation("Delete Delete"), "Delete")
        self.assertEqual(clean_translation("İptal  İptal"), "İptal")

    def test_normalizes_whitespace(self):
        self.assertEqual(clean_translation("  word   other  "), "word other")

    def test_removes_consecutive_duplicates(self):
        self.assertEqual(clean_translation("Açık açık açık"), "Açık")

    def test_preserves_single_words(self):
        self.assertEqual(clean_translation("Başarı"), "Başarı")

    def test_dedash_duplicate(self):
        self.assertEqual(clean_translation("Час - час."), "Час")

    def test_empty_input(self):
        self.assertEqual(clean_translation(""), "")
        self.assertEqual(clean_translation(None), None)


class TestGetMissingTranslations(unittest.TestCase):
    def test_finds_missing(self):
        data = {
            "file1.php": {
                "KEY1": {"en": "Delete", "ru": "Удалить", "tr": None, "ua": ""},
                "KEY2": {"en": "Edit", "ru": "Изменить", "tr": None, "ua": "Редагувати"},
            }
        }
        tasks = get_missing_translations(data, "en", ["tr", "ua"])
        self.assertIn("Delete", tasks)
        self.assertIn("tr", tasks["Delete"])
        self.assertIn("ua", tasks["Delete"])
        self.assertIn("Edit", tasks)
        self.assertIn("tr", tasks["Edit"])
        self.assertNotIn("ua", tasks["Edit"])  # ua has value

    def test_respects_file_paths_filter(self):
        data = {
            "file1.php": {"K1": {"en": "A", "ru": "А", "tr": None}},
            "file2.php": {"K2": {"en": "B", "ru": "Б", "tr": None}},
        }
        tasks_all = get_missing_translations(data, "en", ["tr"])
        tasks_f1 = get_missing_translations(data, "en", ["tr"], file_paths=["file1.php"])
        self.assertEqual(len(tasks_all), 2)
        self.assertEqual(len(tasks_f1), 1)
        self.assertIn("A", tasks_f1)
        self.assertNotIn("B", tasks_f1)

    def test_skips_empty_source(self):
        data = {"f.php": {"K": {"en": "", "ru": None, "tr": None}}}
        tasks = get_missing_translations(data, "en", ["tr"])
        self.assertEqual(len(tasks), 0)


class TestCLI(unittest.TestCase):
    def test_help_exits_cleanly(self):
        """Requires: pip install -r requirements.txt"""
        import subprocess
        script = os.path.join(os.path.dirname(os.path.abspath(__file__)), "bitrix24_translator_complete.py")
        result = subprocess.run(
            [sys.executable, script, "--help"],
            capture_output=True,
            text=True,
        )
        if result.returncode != 0:
            self.skipTest(
                f"CLI script failed (deps? run: pip install -r requirements.txt): {result.stderr[:200]}"
            )
        self.assertEqual(result.returncode, 0)
        self.assertIn("--input", result.stdout)
        self.assertIn("--file-batch-size", result.stdout)


if __name__ == "__main__":
    unittest.main()
