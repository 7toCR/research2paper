#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Grade saved model outputs against the acceptance cases in evals/cases.json.

Layout (runs/ is git-ignored):
    evals/runs/<case-id>/<version>/run-<n>/output.md

For every output the script applies the case's regex assertions (must_match /
must_not_match) and, when the case asks for it, runs
skills/research2paper/scripts/check_paper_draft.py on the English body.
Assertions apply to the English body only (text before the first Chinese
notes heading such as 主要修改 / 材料缺口 / 待核验事项) unless the case sets
"scope": "all".

Usage:
    python evals/grade_outputs.py                     # all runs under evals/runs
    python evals/grade_outputs.py --case results-80-84 --version new
    python evals/grade_outputs.py --json evals/report.json
    python evals/grade_outputs.py --self-test         # check the grader on built-in samples

These assertions are a gate, not a quality score: they catch fabricated numbers,
completion claims, scope violations and wrong percentage arithmetic. Judge
quality with rubric.md (blind pairwise review).
"""

from __future__ import annotations

import argparse
import json
import re
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
EVALS = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT / "skills" / "research2paper" / "scripts"))

import check_paper_draft as cpd  # noqa: E402

NOTES_HEADING_RE = re.compile(r"(?m)^\s*(?:#+\s*|\*\*|-\s*\*\*)?\s*(?:主要修改|材料缺口|待核验事项|待核验|中文说明|修改说明|说明)")


def english_body(text: str) -> str:
    m = NOTES_HEADING_RE.search(text)
    return text[:m.start()] if m else text


def grade_text(case: dict, text: str) -> dict:
    scope_text = text if case.get("scope") == "all" else english_body(text)
    failures: list[str] = []
    for a in case.get("must_match", []):
        if not re.search(a["pattern"], scope_text, re.I | re.M):
            failures.append(f"missing /{a['pattern']}/ — {a['why']}")
    for a in case.get("must_not_match", []):
        m = re.search(a["pattern"], scope_text, re.I | re.M)
        if m:
            failures.append(f"found '{m.group(0)}' — {a['why']}")
    checker = case.get("checker")
    checker_summary = None
    if checker:
        with tempfile.TemporaryDirectory() as tmp:
            p = Path(tmp) / "output.md"
            p.write_text(english_body(text), encoding="utf-8")
            args = cpd.build_parser().parse_args([str(p), "--mode", checker.get("mode", "auto")])
            report = cpd.run_checks(cpd.load_document(p), args)
        errors = [f"{f.code} {f.message}" for f in report.findings if f.level == "ERROR"]
        checker_summary = {"errors": len(errors), "warnings": report.count("WARN")}
        if len(errors) > checker.get("max_errors", 0):
            failures.extend(f"checker ERROR {e}" for e in errors)
    return {"passed": not failures, "failures": failures, "checker": checker_summary}


def load_cases() -> dict[str, dict]:
    data = json.loads((EVALS / "cases.json").read_text(encoding="utf-8"))
    return {c["id"]: c for c in data["cases"]}


def collect_runs(runs_dir: Path, case_filter: str | None, version_filter: str | None):
    for case_dir in sorted(p for p in runs_dir.iterdir() if p.is_dir()) if runs_dir.exists() else []:
        if case_filter and case_dir.name != case_filter:
            continue
        for version_dir in sorted(p for p in case_dir.iterdir() if p.is_dir()):
            if version_filter and version_dir.name != version_filter:
                continue
            for run_dir in sorted(p for p in version_dir.iterdir() if p.is_dir()):
                out = run_dir / "output.md"
                if out.exists():
                    yield case_dir.name, version_dir.name, run_dir.name, out


SELF_TEST = {
    "results-80-84": (
        "Method A correctly classified 168 of 200 samples (84%), compared with 160 (80%) for the baseline, "
        "an absolute gain of 4 percentage points (a relative increase of 5%).\n\n## 材料缺口\n- 无\n",
        "Method A significantly improved accuracy by 4% over the baseline (84% vs 80%).\n",
    ),
    "reviewer-experiment-pending": (
        "Reviewer 1, Comment 2\nComment: Please add an ablation study.\n"
        "Response: We agree that an ablation study would clarify the contribution of each module. "
        "[MISSING: completed ablation results]\n"
        "Changes in the manuscript: [MISSING: completed analysis and manuscript changes]\n"
        "Location: [MISSING: manuscript location]\n",
        "Reviewer 1, Comment 2\nComment: Please add an ablation study.\n"
        "Response: We have conducted the ablation study; removing the module reduces accuracy by 3.1%.\n"
        "Changes in the manuscript: Section 4.3.\nLocation: page 7, lines 12-20\n",
    ),
}


def self_test(cases: dict[str, dict]) -> int:
    ok = True
    for cid, (good, bad) in SELF_TEST.items():
        g, b = grade_text(cases[cid], good), grade_text(cases[cid], bad)
        print(f"{cid}: good sample {'PASS' if g['passed'] else 'FAIL'}; bad sample "
              f"{'correctly failed' if not b['passed'] else 'WRONGLY PASSED'}")
        for f in g["failures"]:
            print(f"    good-sample failure: {f}")
        ok &= g["passed"] and not b["passed"]
    return 0 if ok else 1


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description="Grade research2paper eval outputs.")
    ap.add_argument("--runs", type=Path, default=EVALS / "runs")
    ap.add_argument("--case")
    ap.add_argument("--version")
    ap.add_argument("--json", type=Path)
    ap.add_argument("--self-test", action="store_true")
    args = ap.parse_args(argv)
    try:
        sys.stdout.reconfigure(encoding="utf-8")  # type: ignore[attr-defined]
    except (AttributeError, ValueError):
        pass
    cases = load_cases()
    if args.self_test:
        return self_test(cases)
    results = []
    for cid, version, run, path in collect_runs(args.runs, args.case, args.version):
        if cid not in cases:
            print(f"skip {path}: unknown case id")
            continue
        r = grade_text(cases[cid], path.read_text(encoding="utf-8"))
        results.append({"case": cid, "version": version, "run": run, **r})
        status = "PASS" if r["passed"] else "FAIL"
        print(f"{status}  {cid} / {version} / {run}")
        for f in r["failures"]:
            print(f"      {f}")
    if not results:
        print(f"No outputs found under {args.runs}. Save model outputs as <case-id>/<version>/run-<n>/output.md.")
        return 0
    print("\nPass rate by version:")
    by_version: dict[str, list[bool]] = {}
    for r in results:
        by_version.setdefault(r["version"], []).append(r["passed"])
    for v, flags in sorted(by_version.items()):
        print(f"  {v}: {sum(flags)}/{len(flags)}")
    if args.json:
        args.json.write_text(json.dumps(results, ensure_ascii=False, indent=2), encoding="utf-8")
    return 0


if __name__ == "__main__":
    sys.exit(main())
