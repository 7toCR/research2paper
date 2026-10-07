"""Repository structure checks: skill metadata, mirror, README prompts, links, privacy.

Run from the repository root:  python -m unittest discover -s tests
"""

from __future__ import annotations

import filecmp
import json
import re
import subprocess
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SKILL = ROOT / "skills" / "research2paper"
MIRROR = ROOT / ".claude" / "skills" / "research2paper"
TEXT_SUFFIXES = {".md", ".py", ".json", ".yaml", ".yml", ".mdc", ".tex", ".bib", ""}


def repo_files() -> list[Path]:
    """Files git tracks or would track (respects .gitignore: node_modules, local reference checkouts)."""
    skip = {".git", "__pycache__", "runs", "inputs", "node_modules"}
    try:
        out = subprocess.run(["git", "ls-files", "-z", "--cached", "--others", "--exclude-standard"],
                             cwd=ROOT, capture_output=True, check=True).stdout
        paths = [ROOT / p for p in out.decode("utf-8").split("\0") if p]
    except (OSError, subprocess.CalledProcessError):
        paths = list(ROOT.rglob("*"))
    return [p for p in paths if p.is_file() and not (set(p.relative_to(ROOT).parts) & skip)]


def frontmatter(text: str) -> dict[str, str]:
    m = re.match(r"^---\n(.*?)\n---\n", text, re.S)
    assert m, "missing YAML frontmatter"
    out = {}
    for line in m.group(1).splitlines():
        k, _, v = line.partition(":")
        out[k.strip()] = v.strip()
    return out


class SkillMetadata(unittest.TestCase):
    def test_frontmatter(self):
        fm = frontmatter((SKILL / "SKILL.md").read_text(encoding="utf-8"))
        self.assertEqual(fm.get("name"), "research2paper")
        desc = fm.get("description", "")
        self.assertTrue(0 < len(desc) <= 1024, len(desc))
        self.assertNotRegex(desc, r"[<>]")
        self.assertNotRegex(desc, r": ", "an unquoted ': ' breaks YAML parsing of the description")
        try:
            import yaml  # optional: only for the stricter check
        except ImportError:
            return
        text = (SKILL / "SKILL.md").read_text(encoding="utf-8")
        parsed = yaml.safe_load(re.match(r"^---\n(.*?)\n---", text, re.S).group(1))
        self.assertEqual(parsed["name"], "research2paper")

    def test_every_reference_is_reachable_from_skill_md(self):
        text = (SKILL / "SKILL.md").read_text(encoding="utf-8")
        for ref in (SKILL / "references").glob("*.md"):
            self.assertIn(f"references/{ref.name}", text, ref.name)
        self.assertIn("scripts/check_paper_draft.py", text)

    def test_skill_paths_mentioned_exist(self):
        for path in SKILL.rglob("*.md"):
            for rel in re.findall(r"`((?:references|scripts|assets)/[\w./-]+)`", path.read_text(encoding="utf-8")):
                self.assertTrue((SKILL / rel).exists(), f"{path.name}: {rel}")

    def test_openai_yaml(self):
        text = (SKILL / "agents" / "openai.yaml").read_text(encoding="utf-8")
        self.assertIn("$research2paper", text)

    def test_licenses_match(self):
        self.assertTrue(filecmp.cmp(ROOT / "LICENSE", SKILL / "LICENSE", shallow=False))


class Mirror(unittest.TestCase):
    def test_claude_mirror_identical(self):
        self.assertTrue(MIRROR.exists(), "missing .claude/skills/research2paper mirror")
        src = sorted(p.relative_to(SKILL) for p in SKILL.rglob("*") if p.is_file() and "__pycache__" not in p.parts)
        dst = sorted(p.relative_to(MIRROR) for p in MIRROR.rglob("*") if p.is_file() and "__pycache__" not in p.parts)
        self.assertEqual(src, dst)
        for rel in src:
            self.assertTrue(filecmp.cmp(SKILL / rel, MIRROR / rel, shallow=False), str(rel))


class PiPackage(unittest.TestCase):
    def test_manifest_points_at_existing_resources(self):
        pkg = json.loads((ROOT / "package.json").read_text(encoding="utf-8"))
        self.assertIn("pi-package", pkg["keywords"])
        for rel in pkg["pi"]["extensions"] + pkg["pi"]["skills"]:
            self.assertTrue((ROOT / rel).exists(), rel)
        self.assertEqual(pkg["pi"]["skills"], ["./skills"], "the agent must load the canonical skill, not the mirror")

    def test_host_packages_are_peers_not_dependencies(self):
        pkg = json.loads((ROOT / "package.json").read_text(encoding="utf-8"))
        for name in ("@earendil-works/pi-coding-agent", "@earendil-works/pi-ai", "typebox"):
            self.assertEqual(pkg["peerDependencies"].get(name), "*", name)
            self.assertNotIn(name, pkg.get("dependencies", {}), name)


class Readme(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.text = (ROOT / "README.md").read_text(encoding="utf-8")

    def test_nine_prompts(self):
        blocks = re.findall(r"````markdown\n(.*?)\n````", self.text, re.S)
        self.assertEqual(len(blocks), 9)
        for b in blocks:
            self.assertRegex(b, r"^# Research2Paper · ")
            self.assertIn("## 我的输入", b)
            self.assertIn("```text", b)
            self.assertEqual(len(re.findall(r"(?m)^```", b)) % 2, 0, "unbalanced inner code fence")
            self.assertIn("[MISSING", b)
            self.assertNotRegex(b, r"README|SKILL\.md|DR\.Can\.md")  # each prompt stands alone

    def test_old_anchors_kept(self):
        for anchor in ("sci-dr-can-flash", "sci-dr-can-pro", "sci-dr-can-introduction", "sci-dr-can-methodology",
                       "sci-dr-can-results-discussion", "sci-dr-can-conclusion-abstract-title",
                       "sci-dr-can-figures-tables", "sci-dr-can-reviewer-response", "sci-dr-can-submission-check",
                       "overview", "prompts", "skills", "acknowledgements", "license"):
            self.assertIn(f'<a id="{anchor}"></a>', self.text, anchor)

    def test_internal_anchor_links_resolve(self):
        ids = set(re.findall(r'<a id="([^"]+)"></a>', self.text))
        for target in re.findall(r"\]\(#([^)]+)\)", self.text):
            self.assertIn(target, ids, target)


class Links(unittest.TestCase):
    def test_relative_markdown_links(self):
        for path in repo_files():
            if path.suffix != ".md" or "fixtures" in path.parts:
                continue
            text = re.sub(r"```.*?```", "", path.read_text(encoding="utf-8"), flags=re.S)
            for target in re.findall(r"\]\(([^)\s]+)\)", text):
                if re.match(r"[a-z]+:", target) or target.startswith("#"):
                    continue
                rel = target.split("#", 1)[0]
                self.assertTrue((path.parent / rel).exists(), f"{path.relative_to(ROOT)} -> {target}")


class Privacy(unittest.TestCase):
    def test_no_local_paths_or_usernames(self):
        pattern = re.compile(r"[A-Z]:[\\/]Users[\\/]|/Users/[a-z]|/home/[a-z]+/|C:/Users|D:/github", re.I)
        for path in repo_files():
            if path.suffix not in TEXT_SUFFIXES or path.name == "test_repository.py":
                continue
            text = path.read_text(encoding="utf-8", errors="replace")
            self.assertIsNone(pattern.search(text), str(path.relative_to(ROOT)))

    def test_source_notes_untouched(self):
        import hashlib
        digest = hashlib.sha256((ROOT / "docs" / "DR.Can.md").read_bytes()).hexdigest()
        self.assertEqual(digest, "29e9c42d04c78dfc8349e8b5d6bdac125cfc7193a57b04d25e1116de191200e8")


if __name__ == "__main__":
    unittest.main()
