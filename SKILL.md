---
name: ratchet
description: Build packs for /goal-driven stacked PRs. Turns a settled plan into PR chapters with tests-first checkpoints, runs the Codex plan review, prints each PR's paste-ready /goal, builds consecutive PRs unattended up to the next deploy, carries a change up an open stack, judges whether a built PR is safe to merge, and cleans up after it lands. Use when the user says "/ratchet", wants a plan split into checkpoints for the goal command, asks for the goal cmd for a PR, wants a pack's next PRs built without them, needs a change to an open PR carried up the PRs above it, asks if a goal-built PR is safe to merge, or says a pack's PR has merged.
---

# ratchet

A pack turns planned work into a ratchet: each checkpoint is a click forward (its tests went red, then green, then it was committed), and nothing slips back. A fresh `/goal` session resumes from the last green commit, and no session weakens a test to get past a stop. A `/goal` session builds one PR, or `run` builds consecutive PRs up to the next deploy; the owner merges and deploys; ratchet clears the ground behind them.

Packs live at `~/.claude/plans/<repo>-<slug>/`. ratchet never uses helix and writes nothing under `.helix/`.

| Command | Does |
|---|---|
| `/ratchet <slug> [plan file]` | **make**: settled plan → pack |
| `/ratchet review <slug>` | Codex plan review, then owner sign-off |
| `/ratchet goal <slug> <n>` | preflight PR n, print its `/goal` text |
| `/ratchet run <slug> [n]` | build PR n onward, one background agent per PR, until the owner is needed |
| `/ratchet restack <slug> <n> [change]` | change open PR n, rebase the open PRs above it |
| `/ratchet ready <slug> <n>` | merge and deploy verdict for a built PR |
| `/ratchet landed <slug> <n>` | PR n merged: clean up, move the rest of the stack onto main |

`<slug>` names one piece of work, and so one pack: the pack directory minus `<repo>-` (`billing-export` → `~/.claude/plans/<repo>-billing-export/`). **make** sets it, kebab-case, from the work's name; every other command takes the same slug, or the full directory name. It is distinct from the pack's short abbreviation (`bex`), which only names branches, worktrees and compose projects (profile §Naming). Plain-language asks map onto these: "split this into checkpoints, I'll use goal" is **make**; "give me the goal cmd for PR 2" is **goal**; "build the rest" or "keep going until the deploy" is **run**; "PR 1 needs a change, carry it up" is **restack**; "is this PR safe to merge" is **ready**; "PR 3 is merged, clean up" is **landed**.

## Shared setup

1. **Repo profile.** `<repo>` is the basename of the main checkout's git toplevel. Read `repos/<repo>.md` beside this file in full: gates, CI jobs, workspace, conventions and deploy rules all come from it. No profile → write one first (§New repo profile).
2. **Pack.** If `<pack>/README.md` exists, read it and the chapter in play. The pack README is what goal sessions obey; keep it the single source of truth for the protocol, and change the pack (not the templates) when one pack needs something different.
3. **Log.** `<pack>/LOG.md` is append-only, one line per event:
   - `PR <n> built #<pr> tip <sha> CI green <run url> <date>`
   - `PR <n> tip <sha> <date> (<why>)`, written before and after any branch move
   - `PR <n> merged <sha> <date>; cleaned`
   - `RUN start <date> from PR <n>` and `RUN end <date> <outcome>`

   A `RUN start` with no later `RUN end` means a run is building. While it is, `landed` and `restack` move no branch of this pack: say which PR is building and wait for the run's block, unless the owner says the run is dead.

## make

Input is a **settled** plan: a file the user names, or the decisions settled in this conversation. When a design question is still open, list the open questions and stop; ratchet partitions plans, it does not make them.

1. **Pin the base.** `git fetch`, record `origin/main`'s short sha. Every verified fact cites it.
2. **Plan file.** Write the plan into the pack (`PLAN.md`, or the given file under its own name). It wins over the README on *what*; the README wins on *how*.
3. **Recon.** Read every file the plan changes at the pinned sha and record `file:line` facts per area. For a plan wider than ~3 packages, send one Explore agent per area in a single message, each returning `file:line` facts. Done when every behaviour in the plan points at existing code by `file:line` or is marked NEW, and every test file a checkpoint will touch has been opened.
4. **Partition.** Read `references/checkpoints.md` and split the plan into PRs and checkpoints by its rules.
5. **Write the pack** from `templates/`:
   - `README.md` from `templates/README.md`, filling `{{…}}` from the plan and the profile's sections of the same names;
   - one `pr<n>-<slug>.md` per PR from `templates/chapter.md`, each ending in its goal from `templates/goal.md`;
   - `setup-worktree.sh` from the profile's script template, on the next free port block (profile §Workspace), `chmod +x`;
   - `REVIEW_PROMPT` from `templates/REVIEW_PROMPT.md`; an empty `approvals/` directory.
6. **Check.** `node ~/.claude/skills/ratchet/scripts/check-pack.mjs <pack>`; fix and re-run until it prints `OK`.
7. **Show** a table (PR · title · checkpoints in a few words · can start when), the pause points, and every place the pack departs from what was discussed, with the reason. Offer `/ratchet review`.

Done when `check-pack` prints `OK` and the table is shown.

## review

The adversarial plan review, run with the mechanics in `~/.claude/skills/codex-review/SKILL.md` Step 2 (read it for the exact commands): read-only (`-s read-only` on the first call, `-c sandbox_mode="read-only"` on every resume), `< /dev/null`, Bash timeout 600000, no `-m`, one thread for every round.

1. Round 1 sends `<pack>/REVIEW_PROMPT`; later rounds resume the same thread with "I revised the pack. Re-review the same files. Same rules. End with VERDICT: APPROVED or VERDICT: REVISE." Up to 5 rounds.
2. After each REVISE: decide each finding (fix, or reject with a reason), edit the pack, re-run `check-pack`, append the critique and your dispositions to `<pack>/PLAN-REVIEW-LOG.md`.
3. On APPROVED, or deadlock at round 5: show three bullets on what the review changed, and every unresolved point with both positions.
4. **Sign-off.** Ask the owner to sign off the pack. On their yes, write `<pack>/approvals/plan` holding the date, the base sha and the round count. Every goal refuses to start without this file. A pack edit after sign-off (a `c2b` added at a pause, a fact that drifted) is shown to the owner as a diff before the next goal runs.

## goal

1. **Preflight**, each line reported as ok or the problem:
   - `approvals/plan` exists; else point at `/ratchet review`;
   - PR n-1: open, merged, or (when §2 marks the PR as waiting on a deploy) deployed by the profile's deploy check; a deploy you cannot confirm is asked, not assumed;
   - the base ref as of now: `origin/main` when PR n-1 has merged (or n = 1), else PR n-1's pushed branch, and that branch contains `origin/main`;
   - every approval file a pause needs, if the goal will resume past one.
2. **Workspace.** Run `<pack>/setup-worktree.sh <n> <base ref> <branch>` (idempotent) so the worktree exists before the owner opens a session in it.
3. **Print** the chapter's Goal block in one fenced block, with the base ref resolved in step 1, then one line: `cd <worktree> && claude`, auto mode, paste after `/goal`.

## run

Builds PR n, n+1, … in order, each by one background build agent with a fresh context, and stops at the first point that needs the owner. This session only coordinates: it never edits code, and it reads each agent's final block, not its work, so its own context stays small across many PRs. Without n, it starts at the first PR in §2 order that is neither merged (`gh pr view`) nor already built (step 2.1), however its earlier PRs were built. Start it from the main checkout in auto mode; to hold it to the end, the owner can wrap it: `/goal Run the ratchet run for <slug> from PR <n> (~/.claude/skills/ratchet/SKILL.md §run). Met only when a RUN REPORT, RUN PAUSED or RUN BLOCKED block is printed.`

1. **Start.** `approvals/plan` exists, else stop and point at `review`. Append `RUN start`.
2. **For each PR k from n**, one at a time (two PRs never build at once: each stacks on the last one's final commit):
   1. **Already built?** An open PR whose head is the branch tip, with CI green on that head (a PR a `/goal` session built counts) → append the `built` line if the log lacks it, next k. A merged PR → next k. A re-run resumes here.
   2. **Can it start?** If §2 or the chapter's goal makes PR k wait on PR k-1's deploy, run the profile's deploy check; not confirmed → stop with `RUN PAUSED` naming the deploy. Then **goal** steps 1–2 (preflight, workspace).
   3. **Dispatch** one Agent (general-purpose, `run_in_background`) whose prompt is the chapter's Goal block with the base resolved, followed by:
      - "Work in `<worktree>`: begin every Bash command with `cd <worktree> &&`."
      - for a PR that waits on a deploy: "PR k-1 is confirmed deployed: `<deploy run url>`."
      - "You run unattended and nobody answers questions. Wherever the goal says to stop, print the block and end. Your final message ends with the `PR k REPORT`, `PR k PAUSED` or `PR k BLOCKED` block, verbatim."
   4. **No block in the final message** → SendMessage the same agent: "Continue the goal from where you stopped (README §4.1 resume). End with the block." If it cannot continue (context spent, agent gone), dispatch a fresh agent with the same prompt; it resumes after the last committed checkpoint. Three tries without a block → stop with `RUN BLOCKED`.
   5. **`PAUSED` or `BLOCKED`** → stop, carrying the block.
   6. **Verify a `REPORT`**; trust none of it unchecked: `gh pr view` shows it open, with head = the branch tip and base = PR k's base; `gh pr checks` shows the profile's CI jobs green on that head (profile §CI says which skips are not passes); `git log <base>..<branch>` holds one commit per chapter checkpoint; `<pack>/pr<k>-review/` holds the notes with no open blocker or high. A miss → send the agent what failed, once; still missing → stop with `RUN BLOCKED`.
   7. **Record and idle.** Append `PR <k> built …`. Stop PR k's stack by the profile's idle command; volumes and worktree stay for the owner's review and for `landed`.
   8. No PR k+1 → stop: end of pack.
3. **Print** one block, then append `RUN end <date> <outcome>`:
   ```
   RUN REPORT | RUN PAUSED | RUN BLOCKED  <slug>
   PR <k> #<pr> built, tip <sha>, CI green <run url>    (one line per PR built this run)
   stopped: end of pack | PR <k> waits on PR <k-1>'s deploy | <the PR block, verbatim>
   next: <the owner's step, then the command that continues>
   ```
   `RUN REPORT` when the pack is built to the end; `RUN PAUSED` when the owner must act (a deploy, a pause approval: create the approval file, then `/ratchet run <slug>` resumes); `RUN BLOCKED` otherwise.

## restack

Carries a change to open PR n up through the open PRs stacked on it. The change is what the owner describes; or "the review notes" (the owner's PR comments plus open items in `pr<n>-review/`); or none, when the owner pushed it already or `origin/main` moved under the lowest open PR.

1. **Preflight.**
   - PR n is open (merged → that is `landed`);
   - no run is building (Shared setup step 3);
   - the stack above: every PR k > n whose branch exists, in order;
   - each of their worktrees is clean (`git status --porcelain`; dirty → show it and ask);
   - record every one of those branches' tips, and PR n's, now (`git fetch`, `git rev-parse origin/<branch>`): these are the old tips. Append `PR <k> tip <sha> <date> (before restack)` for each.
2. **Change PR n**, in its worktree after `setup-worktree.sh`:
   - lowest open PR and `origin/main` moved: `git rebase origin/main`, resolving conflicts only in the chapter's files;
   - a described change: new commits on top of the checkpoint commits (never rewrite those), within the chapter's files or with a one-line reason in the commit body; a behaviour change gets its test first, under the test budget (README §4.1); then one Codex round on the new commits (README §5, notes in `pr<n>-review/`) with no open blocker or high;
   - PR n's local PR gate (README §4.3), then push (`--force-with-lease` after a rebase).

   A change that contradicts the chapter or README §1 stops here and is reported: chapters change only on the owner's word.
3. **Move each PR above, lowest first.** For k = n+1, …: in its worktree after `setup-worktree.sh`, `git fetch`, then `git rebase --onto origin/<PR k-1 branch> <PR k-1 old tip> <PR k branch>`. Conflicts only in PR k's chapter files → resolve them; any other → `git rebase --abort` and stop. Run PR k's local PR gate; a failure stops before PR k is pushed and names the PR and the test (the change may have made PR k's chapter wrong, which is the owner's call). Then `git push --force-with-lease`.
4. **CI.** Wait for each pushed head (`gh pr checks <pr> --watch`), rerunning runner collisions per profile §CI. A failure is reported, not fixed: restack resolves conflicts and nothing else.
5. **Log** `PR <k> tip <sha> <date> (restacked from PR <n>)` for each moved PR. Report a table (PR · old tip → new tip · gate · CI), then what stopped it, if anything.

Never edits a chapter, merges or deploys.

## ready

Merge and deploy verdict for PR n. Reads only; never merges, deploys or dispatches a workflow.

- **Merge:** `gh pr view` state, `mergeable`, `mergeStateStatus`; the PR head equals the branch tip; commits on `origin/main` the branch lacks; `gh pr checks` on the head with every failing, pending or skipped-but-required job named (profile §CI says which skips are not passes); `<pack>/pr<n>-review/` shows no open blocker or high.
- **Deploy:** migrations in `git diff <base>...HEAD` and whether the code still serving when they run satisfies them; new env vars, secrets, config keys or compose changes; contract changes and the deploy order from the profile; anything the PR body defers.

Open with one line, `Safe to merge and deploy` or `Not yet: <reason>`, then **Merge** and **Deploy** sections.

## landed

1. `gh pr view <n> --json state,mergeCommit`. Not merged → say so and stop.
2. **Keep the record.** Codex notes belong in `<pack>/pr<n>-review/`; copy any that live only in the worktree (`.scratch/`) into the pack before deleting anything.
3. **Tear down only this PR** by the profile's teardown: its compose project with `down -v`, that project's images, listeners on this PR's ports, the worktree (show `git status --porcelain` and ask first if it holds untracked or modified non-ignored files), the local branch once merged into `origin/main`, `git fetch --prune`. Name every other pack's stack and worktree still running and leave them untouched.
4. **Move the rest of the stack.** If PR n+1's branch exists: record the old tips (restack step 1's last bullet), then restack steps 3–5 with `origin/main` as PR n+1's new base and `gh pr view <n> --json headRefOid` (PR n's head when it merged) as PR n's old tip. Then `gh pr edit <n+1> --base main` if GitHub has not already retargeted it. If PR n+1 is not started, give `/ratchet run <slug> <n+1>` (or `goal`) and any deploy it waits on.
5. **Log.** Append `PR <n> merged <sha> <date>; cleaned` to `<pack>/LOG.md`, and update the repo's memory handoff for this work if one exists.
6. Report **Removed**, **Saved**, **Not touched**.

## New repo profile

Write `repos/<repo>.md` with the headings of an existing profile in `repos/` (none on disk: Naming, Workspace, Teardown, Gates, CI, Deploy, Conventions every pack carries), filled from the repo itself: `package.json` scripts, CI workflows (job names, path filters, shards), deploy workflows, `CLAUDE.md`, compose files. Write its setup-script template beside it. Show the profile and use it only after the owner has corrected it.
