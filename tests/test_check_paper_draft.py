"""Regression tests for skills/research2paper/scripts/check_paper_draft.py.

Run from the repository root:  python -m unittest discover -s tests
"""

from __future__ import annotations

import contextlib
import io
import json
import sys
import tempfile
import unittest
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SKILL = ROOT / "skills" / "research2paper"
FIXTURES = Path(__file__).resolve().parent / "fixtures"
sys.path.insert(0, str(SKILL / "scripts"))

import check_paper_draft as cpd  # noqa: E402


def run(path: Path, *extra: str) -> cpd.Report:
    args = cpd.build_parser().parse_args([str(path), *extra])
    doc = cpd.load_document(args.input, args.format)
    notes = args.notes.read_text(encoding="utf-8") if args.notes else None
    return cpd.run_checks(doc, args, notes)


def codes(report: cpd.Report, level: str | None = None) -> set[str]:
    return {f.code for f in report.findings if level is None or f.level == level}


def run_text(text: str, suffix: str = ".md", *extra: str) -> cpd.Report:
    with tempfile.TemporaryDirectory() as tmp:
        p = Path(tmp) / f"draft{suffix}"
        p.write_text(text, encoding="utf-8")
        return run(p, *extra)


class ExamplesPass(unittest.TestCase):
    def test_example_manuscript_is_clean(self):
        r = run(SKILL / "assets" / "example_manuscript.md", "--abstract-words", "200")
        self.assertEqual(r.mode, "manuscript")
        self.assertEqual(r.count("ERROR"), 0, cpd.format_report(r))
        self.assertEqual(r.count("WARN"), 0, cpd.format_report(r))

    def test_example_response_is_clean(self):
        r = run(SKILL / "assets" / "example_response_letter.md")
        self.assertEqual(r.mode, "response")
        self.assertEqual(r.count("ERROR"), 0, cpd.format_report(r))
        self.assertEqual(r.count("WARN"), 0, cpd.format_report(r))

    def test_cli_exit_codes(self):
        with contextlib.redirect_stdout(io.StringIO()):
            self.assertEqual(cpd.main([str(SKILL / "assets" / "example_manuscript.md")]), 0)
            self.assertEqual(cpd.main([str(FIXTURES / "flawed_manuscript.md")]), 1)


class FlawedManuscript(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.r = run(FIXTURES / "flawed_manuscript.md")

    def test_errors(self):
        self.assertTrue({"C01", "E01", "F01", "G01"} <= codes(self.r, "ERROR"), cpd.format_report(self.r))

    def test_warnings(self):
        expected = {"A01", "C02", "C04", "D01", "F02", "F03", "F04", "F06", "G02", "G04", "N01",
                    "W01", "W02", "W03", "W04", "W05"}
        self.assertTrue(expected <= codes(self.r, "WARN"), sorted(expected - codes(self.r, "WARN")))

    def test_percentage_point_message(self):
        msg = next(f.message for f in self.r.findings if f.code == "W04")
        self.assertIn("4 percentage points", msg)
        self.assertIn("5%", msg)


class PaperLayer(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.r = run(FIXTURES / "flawed_layers.md")

    def test_audit_remarks_flagged_per_line(self):
        w06 = [f for f in self.r.findings if f.code == "W06"]
        self.assertEqual({f.where.split()[1] for f in w06}, {"16", "24"}, cpd.format_report(self.r))

    def test_boundary_budget(self):
        w07 = [f.where for f in self.r.findings if f.code == "W07"]
        self.assertTrue(any("Abstract" in w for w in w07))
        self.assertTrue(any("Conclusion" in w for w in w07))
        self.assertTrue(any("Introduction" in w for w in w07))

    def test_long_marker_and_settings_without_purpose(self):
        self.assertIn("G06", codes(self.r, "WARN"))
        self.assertIn("M01", codes(self.r, "INFO"))

    def test_limitations_paragraph_is_exempt(self):
        text = ("## Discussion\n\nThe evidence has clear limits. The scores cannot identify the mechanism. "
                "The checker's error rate was not measured. Results cannot be generalised to field data. "
                "We did not compare against other planners.\n")
        self.assertNotIn("W07", codes(run_text(text, ".md", "--mode", "section")))

    def test_research_limits_are_not_audit_remarks(self):
        text = ("## Results\n\nNo statistical test was performed on the paired outcomes. The aggregate scores "
                "cannot show why the gain occurs; paired intermediate records would test the mechanism.\n")
        self.assertNotIn("W06", codes(run_text(text, ".md", "--mode", "section")))


class PositioningAndGaps(unittest.TestCase):
    def test_name_restating_description(self):
        r = run_text("## Related Work\n\nThe Temporal Event Parser [2] parses temporal events in each clip. "
                     "Graph Neural Networks process graph data [3].\n", ".md", "--mode", "section")
        w08 = [f for f in r.findings if f.code == "W08"]
        self.assertEqual(len(w08), 1, cpd.format_report(r))
        self.assertIn("Temporal Event Parser", w08[0].message)

    def test_catalogue_vs_comparison(self):
        catalogue = ("## Related Work\n\nClip2Text [5] generates captions directly from frames. EventSum [6] fills "
                     "report templates from detected events. FactCheck [7] verifies reports against records.\n")
        compared = catalogue.replace("FactCheck [7] verifies", "Whereas both generate first, FactCheck [7] verifies")
        self.assertIn("W09", codes(run_text(catalogue, ".md", "--mode", "section")))
        self.assertNotIn("W09", codes(run_text(compared, ".md", "--mode", "section")))

    def test_conventions_in_core_text(self):
        self.assertIn("M02", codes(run(FIXTURES / "flawed_layers.md"), "INFO"))
        text = ("## 2.5 Implementation details\n\nThe insertion point falls back to the first record, the offset is "
                "0.5 s, and instructions are truncated to 280 characters with at most 3 constraints.\n")
        self.assertNotIn("M02", codes(run_text(text, ".md", "--mode", "section")))

    def test_final_stage_and_fill_pass(self):
        import fill_gaps
        with tempfile.TemporaryDirectory() as tmp:
            draft = Path(tmp) / "d.md"
            draft.write_text((SKILL / "assets" / "example_manuscript.md").read_text(encoding="utf-8"), encoding="utf-8")
            r = run(draft, "--final")
            self.assertEqual(len([f for f in r.findings if f.code == "G07"]), 2)
            gaps = Path(tmp) / "gaps.json"
            doc = cpd.load_document(draft)
            self.assertEqual(cpd.export_gaps(doc, gaps), 2)
            data = json.loads(gaps.read_text(encoding="utf-8"))
            data["gaps"][0]["value"] = "a synthetic accelerometer model with a noise density of 150 ug/sqrt(Hz)"
            gaps.write_text(json.dumps(data), encoding="utf-8")
            with contextlib.redirect_stdout(io.StringIO()):
                fill_gaps.main([str(draft), str(gaps)])
            filled = Path(tmp) / "d.filled.md"
            text = filled.read_text(encoding="utf-8")
            self.assertIn("150 ug/sqrt(Hz)", text)
            self.assertNotIn("accelerometer model and noise-density", text)  # memo line removed too
            self.assertEqual(draft.read_text(encoding="utf-8").count("[MISSING:"), 4)  # input untouched
            r2 = run(filled, "--final")
            self.assertEqual(len([f for f in r2.findings if f.code == "G07"]), 1)

    def test_fill_keeps_line_endings(self):
        import fill_gaps
        with tempfile.TemporaryDirectory() as tmp:
            for newline in (b"\n", b"\r\n"):
                draft = Path(tmp) / "d.tex"
                draft.write_bytes(b"Stride: [MISSING: stride of the sliding window]." + newline + b"Next." + newline)
                values = Path(tmp) / "v.json"
                values.write_text(json.dumps({"stride of the sliding window": "16 samples"}), encoding="utf-8")
                with contextlib.redirect_stdout(io.StringIO()):
                    fill_gaps.main([str(draft), str(values), "--in-place"])
                self.assertEqual(draft.read_bytes(), b"Stride: 16 samples." + newline + b"Next." + newline)

    def test_fill_separate_notes_file(self):
        import fill_gaps
        with tempfile.TemporaryDirectory() as tmp:
            memo = Path(tmp) / "memo.md"
            memo.write_text("# 中文说明\n\n## 材料缺口\n\n- `[MISSING: stride of the sliding window]`：请提供。\n"
                            "- `[MISSING: title]`：最后确定。\n\n## 待核验事项\n\n- 引用 [3] 未核验。\n", encoding="utf-8")
            values = Path(tmp) / "v.json"
            values.write_text(json.dumps({"[MISSING: stride of the sliding window]": "16 samples"}), encoding="utf-8")
            with contextlib.redirect_stdout(io.StringIO()):
                fill_gaps.main([str(memo), str(values), "--in-place"])
            text = memo.read_text(encoding="utf-8")
            self.assertNotIn("stride", text)
            self.assertIn("[MISSING: title]", text)
            self.assertIn("引用 [3] 未核验", text)


class FlawedLatex(unittest.TestCase):
    def test_latex(self):
        r = run(FIXTURES / "flawed_paper.tex")
        self.assertEqual(r.fmt, "tex")
        self.assertTrue({"C01", "L01"} <= codes(r, "ERROR"), cpd.format_report(r))
        self.assertTrue({"A02", "C04", "F04", "L02", "W03"} <= codes(r, "WARN"), cpd.format_report(r))
        # the commented-out "Fig. 9" must not be read
        self.assertFalse(any("9" in f.message and f.code.startswith("F") for f in r.findings))

    def test_multi_file_latex(self):
        main = r"""\documentclass{article}
\title{Synthetic Multi-File Test}
\begin{document}
\maketitle
\input{sections/intro}
\include{sections/results.tex}
% \input{sections/commented}
\input{sections/absent}
\bibliographystyle{plain}
\bibliography{refs}
\end{document}
"""
        intro = "\\section{Introduction}\nPrior work exists \\cite{known}.\nWe use the Synthetic Noise Ratio (SNR).\n"
        results = ("\\section{Results}\nAs shown in Fig.~\\ref{fig:missing}, the SNR rose \\cite{unknown}.\n"
                   "[MISSING]\n")
        bib = "@article{known, title={Synthetic}, author={Doe, A.}, journal={J. Synth.}, year={2020}}\n"
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / "sections").mkdir()
            (root / "main.tex").write_text(main, encoding="utf-8")
            (root / "sections" / "intro.tex").write_text(intro, encoding="utf-8")
            (root / "sections" / "results.tex").write_text(results, encoding="utf-8")
            (root / "refs.bib").write_text(bib, encoding="utf-8")
            r = run(root / "main.tex")
        by_code = {f.code: f for f in r.findings}
        # included text is checked and located by file and line
        self.assertEqual(by_code["C01"].where.split(" [")[0], "sections/results.tex line 2", cpd.format_report(r))
        self.assertEqual(by_code["G01"].where.split(" [")[0], "sections/results.tex line 3")
        self.assertEqual(by_code["L01"].where, "sections/results.tex line 2")
        # a missing input is reported at the \input line of the main file; a commented one is ignored
        self.assertEqual([f.where for f in r.findings if f.code == "S07"], ["line 8"])
        self.assertIn("sections/absent", by_code["S07"].message)
        self.assertNotIn("commented", cpd.format_report(r))


class FlawedResponse(unittest.TestCase):
    def test_response(self):
        r = run(FIXTURES / "flawed_response.md")
        self.assertEqual(r.mode, "response")
        self.assertIn("R01", codes(r, "ERROR"))
        self.assertTrue({"R02", "R03", "R04", "R05"} <= codes(r, "WARN"), cpd.format_report(r))
        # wording inside quoted reviewer comments is not the authors' claim
        self.assertNotIn("W01", codes(r))


class Heuristics(unittest.TestCase):
    def test_honest_significance_statement_not_flagged(self):
        r = run_text("## Results\n\nThe 4-point gain has not been tested for statistical significance.\n",
                     ".md", "--mode", "section")
        self.assertNotIn("W02", codes(r))
        # negation after the noun (found in a real agent run)
        for honest in ("Statistical significance was not assessed.",
                       "The significance of this difference has not been tested."):
            r = run_text(f"## Results\n\nThe gain is 5 percentage points. {honest}\n", ".md", "--mode", "section")
            self.assertNotIn("W02", codes(r), honest)
        # a claim stays a claim even when another clause is negated
        r = run_text("## Results\n\nA significant gain was not observed in the first run.\n", ".md", "--mode", "section")
        self.assertIn("W02", codes(r))

    def test_relative_change_is_fine(self):
        r = run_text("## Results\n\nAccuracy rose from 80% to 84%, a relative increase of 5%.\n", ".md",
                     "--mode", "section")
        self.assertNotIn("W04", codes(r))

    def test_interval_is_not_a_citation(self):
        r = run_text("## Methods\n\nValues are normalised to [0, 1] and clipped in [1, 10].\n\n"
                     "## References\n\n[1] A. Example, Placeholder, 2020.\n", ".md", "--mode", "section")
        self.assertNotIn("C01", codes(r))

    def test_first_order_is_not_a_priority_claim(self):
        r = run_text("## Methods\n\nwhere the input is the first-order difference of the signal.\n", ".md",
                     "--mode", "section")
        self.assertNotIn("W01", codes(r))

    def test_hard_wrapped_fig_line_is_not_a_caption(self):
        r = run_text("## Results\n\nThe trend is shown in\nFig. 3. It decreases.\n", ".md", "--mode", "section")
        self.assertNotIn("F02", codes(r))

    def test_title_starting_with_method_word(self):
        r = run_text("# Data-Driven Fault Detection\n\n## Abstract\n\nText.\n\n## Introduction\n\nText.\n\n"
                     "## Methods\n\nText.\n\n## Results\n\nText.\n\n## Conclusion\n\nText.\n")
        self.assertEqual(r.mode, "manuscript")
        self.assertNotIn("S01", codes(r))

    def test_yaml_frontmatter_is_metadata(self):
        r = run_text("---\ntitle: 'A Package for ORCID Things'\nauthors:\n  - name: X\n# a YAML comment\n---\n\n"
                     "# Summary\n\nText.\n", ".md", "--mode", "section")
        self.assertNotIn("A02", codes(r))

    def test_abstract_word_limit(self):
        r = run(SKILL / "assets" / "example_manuscript.md", "--abstract-words", "50")
        self.assertIn("S04", codes(r, "ERROR"))

    def test_notes_file(self):
        with tempfile.TemporaryDirectory() as tmp:
            notes = Path(tmp) / "notes.md"
            notes.write_text("- `[MISSING: stride of the sliding window]`：请提供。\n", encoding="utf-8")
            draft = Path(tmp) / "d.md"
            draft.write_text("## Methods\n\nThe stride is [MISSING: stride of the sliding window].\n",
                             encoding="utf-8")
            r = run(draft, "--notes", str(notes))
            self.assertNotIn("G04", codes(r, "WARN"))

    def test_docx_input(self):
        w = "http://schemas.openxmlformats.org/wordprocessingml/2006/main"

        def para(text: str, style: str | None = None) -> str:
            ppr = f'<w:pPr><w:pStyle w:val="{style}"/></w:pPr>' if style else ""
            return f"<w:p>{ppr}<w:r><w:t>{text}</w:t></w:r></w:p>"

        body = "".join([
            para("Adaptive Filtering for Sensors", "Title"),
            para("Abstract", "Heading1"), para("We test a filter on 200 recordings."),
            para("Introduction", "Heading1"), para("Sensors are noisy [1]."),
            para("Methods", "Heading1"), para("We use a TODO filter."),
            para("Results", "Heading1"), para("Accuracy was 84.0% on 200 recordings."),
            para("Conclusion", "Heading1"), para("The filter helps."),
        ])
        xml = f'<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="{w}"><w:body>{body}</w:body></w:document>'
        with tempfile.TemporaryDirectory() as tmp:
            p = Path(tmp) / "draft.docx"
            with zipfile.ZipFile(p, "w") as z:
                z.writestr("word/document.xml", xml)
            r = run(p)
        self.assertEqual(r.mode, "manuscript")
        self.assertNotIn("S01", codes(r))
        self.assertIn("G02", codes(r))


if __name__ == "__main__":
    unittest.main()
