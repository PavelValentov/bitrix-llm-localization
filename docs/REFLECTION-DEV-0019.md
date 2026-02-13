# Reflection: DEV-0019 — Full Localization Workflow

## Summary

Task: document the full localization workflow so a user can repeat the process step by step and obtain ready-to-import translation archives.

## What Was Done

- **FULL-PROCESS.md** — New single-document guide with:
  - Prerequisites and exact commands for each step
  - Steps 1–7: unpack → aggregate → (optional) fill-gaps → translate → restore → create-archives → import in Bitrix24
  - Copy-paste command block for the whole pipeline
  - Optional path with merge-aggregate when a full baseline JSON exists
  - Short troubleshooting notes (Path is invalid, API, structure)

- **USER-WORKFLOW.md** — Updated to:
  - Point to FULL-PROCESS.md as the main step-by-step reference
  - Keep the same flow with brief explanations and alternatives
  - Remove duplication; link to FULL-PROCESS for full commands

- **README.md** — Updated to:
  - Describe the full path in 7 steps (including fill-gaps and Bitrix24 import)
  - Link to docs/FULL-PROCESS.md as the main “how to get the translation” doc
  - Adjust structure description for `output/` and `docs/`

## Lessons Learned

- One “full process” doc with copy-paste commands reduces friction for new users.
- Fill-gaps and merge-aggregate are optional but worth describing for advanced flows.
- Explicit “Step 7: Import in Bitrix24” and a note on “Path is invalid” tie the tooling to the real deployment step.

## Next Steps

- Keep FULL-PROCESS.md in sync when adding new scripts or options.
- If Bitrix24 import flow changes (URLs, steps), update Step 7 and troubleshooting.
