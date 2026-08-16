from __future__ import annotations

import ast
from pathlib import Path
import unittest


class WorkerPluginRegistrationTests(unittest.TestCase):
    def test_livekit_plugins_are_imported_in_the_main_worker_module(self) -> None:
        worker_path = Path(__file__).parents[1] / "src" / "voice_agent" / "worker.py"
        tree = ast.parse(worker_path.read_text(encoding="utf-8"))

        imported_plugins = {
            alias.name
            for node in tree.body
            if isinstance(node, ast.ImportFrom) and node.module == "livekit.plugins"
            for alias in node.names
        }

        self.assertTrue({"silero", "soniox", "openai"}.issubset(imported_plugins))
