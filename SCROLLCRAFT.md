# scrollcraft in this repo

[nateherkai/scroll-craft](https://github.com/nateherkai/scroll-craft) vendored at
upstream commit `e957985` ("fix: iOS scrub-clip priming, plus a real-device
diagnostic page"), MIT licensed.

## Layout

| Path | What it is |
| --- | --- |
| `scroll-craft/` | The upstream repo, unmodified: README, EXAMPLES.md, demo media, and the `nateherk-design` plugin. Reference copy, and where to diff against upstream when it updates. |
| `.claude/skills/scrollcraft/` | The skill itself, copied out of `scroll-craft/plugins/nateherk-design/skills/scrollcraft/` so Claude Code picks it up as a project skill in this repo without a plugin install. |
| `scrollcraft/` | The build workspace the skill resolves to (project root + `/scrollcraft`). `builds/` and `lab/` are gitignored; `FINGERPRINTS.md` is not. |

`scrollcraft/FINGERPRINTS.md` is the uniqueness registry: one row per shipped
page, and a new build has to differ from every existing row on at least 4 of 6
dimensions. It is committed on purpose, so the record survives a fresh
container.

## Updating from upstream

```bash
git clone --depth 1 https://github.com/nateherkai/scroll-craft.git /tmp/sc
rsync -a --delete --exclude .git /tmp/sc/ scroll-craft/
rsync -a --delete scroll-craft/plugins/nateherk-design/skills/scrollcraft/ .claude/skills/scrollcraft/
```

## Environment

`node .claude/skills/scrollcraft/scripts/doctor.mjs` is the preflight. In a
fresh Claude Code web container it needs two things:

```bash
apt-get update -qq && apt-get install -y --no-install-recommends ffmpeg
export SCROLLCRAFT_CHROME=/opt/pw-browsers/chromium-1194/chrome-linux/chrome
```

- **ffmpeg must be a full build.** The Playwright-bundled binary at
  `/opt/pw-browsers/ffmpeg-1011/ffmpeg-linux` is compiled `--disable-everything`
  and lacks the webp muxer, `fps` and `psnr` — do not point `SCROLLCRAFT_FFMPEG`
  at it. The Ubuntu package (564 filters) is what the doctor wants.
- **Chrome** is the preinstalled Playwright Chromium; the path is pinned to the
  container's build number, so re-check it if the doctor reports Chrome missing.
- **`playwright-core`** installs per build folder (`npm i playwright-core`), and
  only the verification pass needs it.
- **`KIE_AI_API_KEY`** is optional: only needed to *generate* imagery and video.
  A bring-your-own-photos build spends nothing. Copy `scroll-craft/.env.example`
  to `.env` (gitignored) to set one.
