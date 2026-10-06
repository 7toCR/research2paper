---
trigger: model_decision
description: Use for Research2Paper skill maintenance, prompt-template edits, SCI paper drafting workflows and privacy-safe agent guidance.
---

# Research2Paper Rule

- Treat `skills/research2paper/SKILL.md` as the canonical skill entrypoint; load files under `skills/research2paper/references/` only when needed.
- Keep drafts faithful to the supplied material; mark missing facts as `[MISSING: ...]` instead of filling them in.
- Run `skills/research2paper/scripts/check_paper_draft.py` on drafts before delivery.
- Do not write private papers, raw data, generated drafts, API keys, tokens, local usernames, local absolute paths or personal contact data into repository files.
- Preserve UTF-8 Markdown; `docs/DR.Can.md` is read-only.
