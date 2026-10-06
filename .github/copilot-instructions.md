# GitHub Copilot Instructions

This repository maintains Research2Paper: prompt templates, an agent skill and a draft checker for evidence-bound SCI paper drafting, based on DR_CAN's SCI writing lessons.

## Working Rules

- Use `skills/research2paper/SKILL.md` as the main workflow for paper drafting, revision, reviewer-response and pre-submission tasks.
- Keep detailed writing rules in `skills/research2paper/references/`.
- Preserve fidelity to the supplied material: do not invent data, statistics, citations, novelty claims or completed experiments; use `[MISSING: ...]` markers.
- Do not commit unpublished papers, raw data, generated drafts, personal data, API keys, tokens, local usernames or local absolute paths.
- Keep Markdown UTF-8; `docs/DR.Can.md` is read-only.

## Validation

After changing the checker or skill content, run `python -m unittest discover -s tests` and `git diff --check`. On Windows, set `PYTHONUTF8=1` first.
