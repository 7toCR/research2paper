# Claude Code Instructions

This repository publishes Research2Paper: prompt templates, an agent skill and a draft checker for turning real research material into evidence-bound SCI paper drafts, based on DR_CAN's SCI writing lessons.

## Project Skill

Use `.claude/skills/research2paper/SKILL.md` when the task involves drafting or revising a paper section, figure captions, a reviewer response letter, or a pre-submission check.

## Repository Rules

- `skills/research2paper/` is the canonical skill; `.claude/skills/research2paper/` is a mirror and must stay identical (`diff -r`).
- Keep `SKILL.md` concise; long rules belong in `references/`. Keep the README prompts consistent with the skill rules when either changes.
- `docs/DR.Can.md` is the source note set: read-only, never edited.
- `agent/` is the pi paper agent (design: `docs/agent-design.md`). It loads `skills/` and calls the Python checker; writing rules never live in the agent. pi packages stay `peerDependencies: "*"` with exact pins in `devDependencies`.
- Keep unpublished papers, raw data, reviewer comments, generated drafts and personal data out of git (`evals/runs/` and `evals/inputs/` are ignored).
- Do not add local machine paths, usernames, API keys, tokens or contact data to any file.
- Example and test content must be clearly synthetic; never add real-looking fabricated references.

## Validation

```bash
python -m unittest discover -s tests          # checker regression + repository structure
python evals/grade_outputs.py --self-test      # eval grader sanity check
diff -r skills/research2paper .claude/skills/research2paper
git diff --check
npm test                                       # agent: unit + faux-model end-to-end tests
npm run typecheck
```

Optionally validate the skill with the skill-creator validator: `python <skill-creator>/scripts/quick_validate.py skills/research2paper`.

To judge whether a change improves draft quality, follow `evals/README.md` (fixed conditions, several runs per case, blind pairwise review with `evals/rubric.md`).
