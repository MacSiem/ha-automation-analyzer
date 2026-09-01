"""Regression coverage for component-local persistence isolation."""
from pathlib import Path
import unittest


ROOT = Path(__file__).resolve().parents[1]
SOURCES = (
    "ha-automation-analyzer.js",
)


class PersistenceIsolationTest(unittest.TestCase):
    def test_persistence_never_uses_a_window_singleton(self):
        for relative_path in SOURCES:
            with self.subTest(path=relative_path):
                source = (ROOT / relative_path).read_text(encoding="utf-8")
                self.assertNotIn("window._haToolsPersistence", source)
                self.assertNotIn("full impl in ha-tools-panel", source)
                self.assertNotIn("haToolsPersistence", source)
                self.assertNotIn("ha-tools-automation-analyzer-settings", source)


if __name__ == "__main__":
    unittest.main()
