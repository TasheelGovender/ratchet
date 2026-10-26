# ratchet

A Claude Code skill for building planned work as stacked pull requests, one tests-first checkpoint at a time, driven by the `/goal` command.

ratchet turns a settled plan into a **build pack**: one chapter per PR, each split into checkpoints whose tests go red, then green, then get committed. A build session resumes from the last green commit, so work only moves forward. Codex reviews the plan once and each finished PR once; the owner merges and deploys.

## Commands

| Command | Does |
|---|---|
| `/ratchet <slug> [plan file]` | make: settled plan → pack |
| `/ratchet review <slug>` | Codex plan review, then owner sign-off |
| `/ratchet goal <slug> <n>` | preflight PR n, print its `/goal` text |
| `/ratchet run <slug> [n]` | build PR n onward, one background agent per PR, until the owner is needed |
| `/ratchet restack <slug> <n> [change]` | change open PR n, rebase the open PRs above it |
| `/ratchet ready <slug> <n>` | merge and deploy verdict for a built PR |
| `/ratchet landed <slug> <n>` | PR n merged: clean up, move the rest of the stack onto main |

`SKILL.md` holds the full behaviour.

## Install

```sh
git clone https://github.com/TasheelGovender/ratchet ~/Dev/ratchet
ln -s ~/Dev/ratchet ~/.claude/skills/ratchet
```

Packs are written to `~/.claude/plans/<repo>-<slug>/`. The Codex reviews need the [Codex CLI](https://github.com/openai/codex) and the `codex-review` skill; GitHub steps need `gh`.

## Layout

- `SKILL.md`: the commands
- `references/checkpoints.md`: rules for cutting PRs and checkpoints
- `templates/`: pack README, chapter, goal text and Codex review prompt
- `scripts/check-pack.mjs`: validates a pack (`node scripts/check-pack.mjs <pack dir>`)
- `repos/`: one profile per repo (gates, CI, workspace ports, deploy rules) plus its worktree setup script. Profiles are local and git-ignored; ratchet writes one the first time it meets a repo.
