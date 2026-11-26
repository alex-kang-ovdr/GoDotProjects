import json
import os
from pathlib import Path
from tempfile import TemporaryDirectory
import unittest

from rule_graph import build_graph


class DependencyGraphTests(unittest.TestCase):
    def test_repeated_relative_root_and_missing_refs_exclude_literals_and_comments(self):
        with TemporaryDirectory() as temp:
            data = Path(temp)
            sub = data / "sub"
            sub.mkdir()
            (data / "base.rules").write_text("", encoding="utf-8")
            (sub / "main.rules").write_text(
                '// <comment.rules>\n'
                'Ignored = "test \\" <quoted.rules>"\n'
                'AlsoIgnored = @"multi ""line\n<verbatim.rules>"\n'
                '/* ignore\n<block.rules> */ A : <../base.rules>/A {}\n'
                'Refs = [&<./Data/base.rules>/A, &<../base.rules>/B]\n'
                'Missing = &<absent.rules>\n',
                encoding="utf-8",
            )
            graph = build_graph(data)
        self.assertEqual(graph["files"]["base.rules"], {})
        self.assertEqual(graph["files"]["sub/main.rules"], {"base.rules": [6, 7, 7], "sub/absent.rules": [8]})
        self.assertEqual(graph["missing_targets"], ["sub/absent.rules"])
        self.assertEqual(graph["summary"], {"files": 2, "edges": 2, "occurrences": 4,
                                            "missing_targets": 1, "missing_edges": 1})


DATA = Path(os.environ.get("COSMOTEER_DATA", "C:/Temp/Cosmoteer/Data"))


@unittest.skipUnless((DATA / "cosmoteer.rules").is_file(), "local original Data directory required")
class InstalledDependencyGraphTests(unittest.TestCase):
    def test_checked_in_snapshot_and_registry_to_projectile(self):
        graph = build_graph(DATA)
        output = Path(__file__).resolve().parents[1] / "data/rule_graph.json"
        self.assertEqual(graph, json.loads(output.read_text(encoding="utf-8")))
        registry = "ships/terran/terran.rules"
        laser = "ships/terran/laser_blaster_small/laser_blaster_small.rules"
        shot = "shots/laser_bolt_small/laser_bolt_small.rules"
        for source, target in [(registry, laser), (laser, shot)]:
            lines = (DATA / source).read_text(encoding="utf-8-sig").splitlines()
            self.assertTrue(graph["files"][source][target])
            for number in graph["files"][source][target]:
                self.assertIn(Path(target).name + ">", lines[number - 1])
        self.assertTrue(all(not (DATA / target).exists() for target in graph["missing_targets"]))


if __name__ == "__main__":
    unittest.main()
