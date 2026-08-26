#!/bin/bash
# Bring a fresh Claude Code web container up to what scrollcraft's preflight
# needs. Idempotent: every step checks before it acts.
#
# Two things are missing from the base image and both fail late and
# confusingly if you skip them:
#
#   ffmpeg   The image ships only Playwright's bundled binary, built
#            --disable-everything. It carries ~50 filters and silently lacks
#            scale, fps, psnr and the webp muxer, so an encode dies with
#            "No option name near ..." which reads as a bad command rather
#            than a missing feature. The Ubuntu package has 564 filters.
#
#   Chrome   Playwright's Chromium is at /opt/pw-browsers/chromium, which is
#            not a path the skill looks in. Linking it to /usr/bin/chromium
#            puts it on the skill's own detection list, so nothing has to
#            hardcode a container-specific path.
#
# Not fatal on failure: a build from your own photos and footage needs
# neither, and the doctor reports what is missing anyway.
set -uo pipefail

if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

if ! command -v ffmpeg >/dev/null 2>&1; then
  echo "session-start: installing ffmpeg"
  apt-get update -qq >/dev/null 2>&1
  DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends ffmpeg >/dev/null 2>&1 \
    || echo "session-start: ffmpeg install failed; asset encoding will not work"
fi

if [ ! -e /usr/bin/chromium ] && [ -e /opt/pw-browsers/chromium ]; then
  echo "session-start: linking Playwright Chromium to /usr/bin/chromium"
  ln -sfn /opt/pw-browsers/chromium /usr/bin/chromium
fi

DOCTOR="${CLAUDE_PROJECT_DIR:-.}/.claude/skills/scrollcraft/scripts/doctor.mjs"
if [ -f "$DOCTOR" ]; then
  node "$DOCTOR" 2>&1 | sed 's/^/session-start: /'
fi

exit 0
