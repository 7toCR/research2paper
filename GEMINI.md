# Gemini Project Context

This repository is a Markdown-first Research2Paper project: Chinese prompt templates, an agent skill and a Python draft checker for turning real research material into evidence-bound SCI paper drafts, based on DR_CAN's SCI writing lessons.

## How To Work Here

- Use `skills/research2paper/SKILL.md` as the main workflow reference; load files under `skills/research2paper/references/` only when the task needs that rule set.
- Preserve fidelity to the supplied material: never invent data, sample sizes, statistics, citations, novelty claims or completed experiments; mark gaps as `[MISSING: specific information]`.
- Treat `docs/DR.Can.md` as read-only source notes.
- Do not commit unpublished papers, raw data, generated drafts, personal data, API keys, tokens, local usernames or local absolute paths.
- Keep Markdown UTF-8. After changing the checker run `python -m unittest discover -s tests`.
