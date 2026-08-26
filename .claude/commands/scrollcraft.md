---
description: Build a premium scroll-driven landing page with the scrollcraft skill
allowed-tools: Bash, Read, Write, Edit, Glob, Grep, AskUserQuestion, Skill
---

Invoke the `scrollcraft` skill (via the Skill tool) and follow it end to end:
interview first, then page grammar, feeling curve, scroll score, signature move,
assets, the build, and the self-verification pass.

Brief from the user (may be empty — if so, start with the interview):

$ARGUMENTS

Environment notes for this repo, so you do not rediscover them:

- Workspace is `scrollcraft/` at the project root. The fingerprint registry is
  `scrollcraft/FINGERPRINTS.md` and it is committed — read it before planning,
  append to it after shipping.
- `KIE_AI_API_KEY` lives in the gitignored `.env` at the project root. Never
  print it, never commit it. Note that `api.kie.ai` may be blocked by this
  environment's network policy; if generation fails on a host error, say so
  rather than retrying, and offer the bring-your-own-assets path.
- Run `node .claude/skills/scrollcraft/scripts/doctor.mjs` first.
