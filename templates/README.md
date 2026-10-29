# {{TITLE}}: build pack

How `{{PLAN_FILE}}` (beside this file) gets built. The plan says what; this pack says in which PRs, with which checkpoints and gates. Where a chapter and this README disagree, this README wins; where this README and `{{PLAN_FILE}}` disagree, `{{PLAN_FILE}}` wins.

Written {{DATE}} against main `{{BASE_SHA}}`. Made with ratchet: stacked PRs, tests-first checkpoints, gates, one build session per PR (a `/goal` session, or a `/ratchet run` build agent). No helix; nothing goes in `.helix/`. Codex reviews twice: the plan before any build, and each PR once it is complete. Checkpoints are proved by their tests and gates, not by Codex.

## §1 Binding decisions (owner, {{DATE}})

{{DECISIONS}}

## §2 PRs and order

{{STACK_RULE}}

| PR | Title | Branch | Base | Checkpoints | Pause |
|---|---|---|---|---|---|
{{PR_ROWS}}

{{PR_NOTES}}

**Pause points** (⏸): {{PAUSES}} At a pause the session commits, runs its gate, prints `PR <n> PAUSED` and stops. The owner approves by creating the empty file `approvals/pr<n>.c<k>` in this pack (or changes the chapter first). A session that finds the paused checkpoint committed and no approval file prints `PAUSED` again and stops.

## §3 Workspace

{{WORKSPACE}}

## §4 PR protocol (what every goal session does)

Every gate, Codex round and CI wait runs in the foreground: never in the background, never behind `sleep`. A wait longer than one Bash call repeats a foreground command until it finishes (§4.4, §5). The session never ends with a job of its own still running, and never writes this pack's `LOG.md`; ratchet does.

1. **Start.** Check `approvals/plan` exists in this pack; if not, print `PR <n> BLOCKED: plan not signed off`. Read `CLAUDE.md`, this README, `{{PLAN_FILE}}` and the PR's chapter. Check out the branch from its base. **Resume point:** a checkpoint is done when its commit exists and its checkpoint gate passed; on resume, re-run the last commit's gate, then continue with the next checkpoint. Re-verify every `file:line` the chapter cites against the base; a drift that changes the plan stops the session (step 7).
   **Test budget (owner rule).** The chapter's listed cases are the ceiling:
   - write exactly the cases each checkpoint lists (each behaviour and each negative), in the files it names, with only the fixtures and helpers it declares;
   - an existing test whose behaviour the checkpoint removes is deleted or rewritten as the chapter says; that is not weakening a test;
   - a case that seems missing goes in the PR body under "Suggested tests";
   - the only addition allowed: one regression test for a bug found while building, named in the commit body;
   - in the whole-PR review, a finding that asks for more tests is accepted only when it shows a blocker or high correctness gap.
2. **Per checkpoint, in order:**
   1. Write the checkpoint's declared tests. Run them and show they fail for the right reason. A checkpoint marked `tests_first: no` skips this; its chapter says where it is proved.
   2. Implement within the declared files. A file outside them needs a one-line reason in the commit body.
   3. Checkpoint gate: {{CHECKPOINT_GATE}}
   4. Commit: `type(scope): <behaviour>`, one checkpoint per commit.
   **Fix commits.** Every commit after the last checkpoint (a Codex finding, a CI failure) is its own `fix(scope): <what>` commit on top, never folded into a checkpoint commit, and is listed under `fixes:` in the report (§4.5). ratchet accepts the checkpoint commits plus exactly those.
   **Base drift.** Before the PR gate, and again before pushing: `git fetch`. If the base branch moved, or PR n-1 has merged (then the base is `origin/main`), rebase, resolve conflicts in the chapter's files, and re-run the last checkpoint's gate. A conflict outside the chapter's files, or one that changes the plan, stops the session (step 7). A rebase after the Codex review that changed more than conflict resolution gets one more Codex round.
3. **Local PR gate** (before pushing):
   - {{LOCAL_PR_GATE}}
   - the chapter's local proofs pass;
   - Codex whole-PR review (§5) has no unresolved blocker or high, at most {{CODEX_PR_ROUNDS}} rounds.
   {{CI_ONLY}}
4. **Open the PR, then CI.** Push the branch and open the PR against its base with the chapter's title. The body describes the change: what an operator or caller can now do and where, server, contract or client changes and why, migrations and deploy notes, what is left for a later PR, owner-facing decisions the chapter says to show, and "Suggested tests". It never lists checkpoints, SHAs, gate or test results, review rounds or deviations: those go in the report block and this pack. One paragraph per line, no hard wraps; write it to a file and pass `--body-file`. End it with the session's attribution lines. Then wait for CI in the foreground: `gh pr checks <pr> --watch` with Bash timeout 600000, run again until it exits. Fix and push until {{CI_JOBS}} are green on the head. CI still running is not a stop: the session ends only once CI on the head has finished. Never merge, deploy or dispatch a deploy workflow; the owner does those.
5. **Report block.** End the session by printing:
   ```
   PR <n> REPORT
   branch: <branch> @ <sha>
   checkpoints: <id> <sha> … (all committed)
   fixes: <sha> <why> … | none
   gate: {{REPORT_GATE}} | CI green <run url>
   proof: <the chapter's proof figure, or none>
   codex: PR review rounds <n>, open blockers/highs 0, notes {{PACK_DIR}}/pr<n>-review/
   pr: <url>
   deviations: <none | list>
   ```
   The `/goal` evaluator reads only the transcript, so this block is the proof the goal is met.
6. **Pause point.** At a ⏸ that triggers, commit, run its gate, print a `PR <n> PAUSED` block (what the owner must look at or decide, any measured number, absolute paths, the approval file to create) and stop.
7. **Stop early** (print `PR <n> BLOCKED` with the reason) when: the plan is not signed off; the chapter contradicts the code or the contract; a proof can only pass by weakening it; the Codex whole-PR review still holds a blocker or high after its last round; the Codex review cannot run (`codex-review.mjs wait` exits 1: print `PR <n> BLOCKED: codex review unavailable` with the log paths it gives, and do not push); a rebase conflicts outside the chapter's files; the environment is missing something; or the goal's turn bound is reached (name the last done checkpoint and the next step). Never widen scope or weaken a proof to get past one.

## §5 Codex reviews

Codex is read-only in every review and runs only through `~/.claude/skills/ratchet/scripts/codex-review.mjs`, which caps each round's wall clock and silence and retries a failed round twice. Never call `codex exec` directly; never pass `-m` (the model comes from `~/.codex/config.toml`).

```
R=~/.claude/skills/ratchet/scripts/codex-review.mjs
node $R start {{PACK_DIR}}/pr<n>-review/r1.md --prompt-file {{PACK_DIR}}/pr<n>-review/prompt-r1.md --cd <worktree>
node $R start {{PACK_DIR}}/pr<n>-review/r<k>.md --resume <thread> --message "<what changed; same rules>" --cd <worktree>
node $R wait {{PACK_DIR}}/pr<n>-review/r<k>.md        # Bash timeout 600000; exit 2 = still running, run it again
```

`wait` exit 0 prints the thread id and the VERDICT line, with the critique in `r<k>.md`; exit 1 means the review is unavailable (§4.7).

- **Plan review (once, before PR 1).** `/ratchet review`: `{{PLAN_FILE}}`, this README and every chapter, one thread, up to 5 rounds, prompt in `REVIEW_PROMPT`, output in `plan-review/`, log in `PLAN-REVIEW-LOG.md`. The owner's sign-off is `approvals/plan`.
- **Whole-PR review.** Fresh thread over `git diff <base>...HEAD` against the chapter (each checkpoint's behaviour and constraints) and §1, with one line per §1 decision it touched (`§1.<n> | honoured | violated | not applicable`), findings as blocker / high / medium / low with location and a one-line fix. Up to {{CODEX_PR_ROUNDS}} rounds, the later ones resuming the same thread. Codex's output goes straight into this pack, as above, and your disposition of each finding (fixed in `<sha>` / rejected because … / owner question) in `pr<n>-review/dispositions.md`. Nothing about the review lives only in the worktree.
- **Owner questions.** A finding whose fix would change what an operator or caller sees beyond what the chapter specifies (a new refusal, error code, rule or default) is not fixed in this PR: record it as `owner question` in `dispositions.md` and list it under `deviations:` in the report. It does not count as an open blocker or high unless leaving it unfixed breaks the chapter's own behaviour; then stop (§4.7).

## §6 Gates at a glance

| Gate | When | Passes when |
|---|---|---|
| Plan | once, before PR 1 | Codex `APPROVED` (or deadlock reported) and `approvals/plan` |
| Checkpoint | every commit | declared tests fail first, then pass; {{CHECKPOINT_GATE_SHORT}} |
| PR | before pushing; then after opening | local: {{LOCAL_PR_GATE_SHORT}}, chapter proof, Codex whole-PR review · after opening: {{CI_JOBS}} green |
| Merge | owner | CI green, owner review (`/ratchet ready`) |

## §7 Chapter format

`pr<n>-<slug>.md`, H1 `# PR<n> · \`<conventional title>\``, sections in order: Scope; Decisions honoured; Verified facts (`file:line` on `{{BASE_SHA}}`); Files; Docs landed; Checkpoints (ordered; each with id `pr<n>.c<k>`, behaviour, files, tests and what they assert including the negative case, constraints, `depends_on`, ⏸ if a pause); PR-level proof; Hand-off; Goal.

## §8 Goal prompts

Each chapter ends with the text to paste after `/goal` in a fresh session started in the worktree, in auto mode (`/ratchet goal` prints it with the base resolved). Each is under 4,000 characters, points at the chapter for detail, and is met only by the printed `PR <n> REPORT`, `PAUSED` or `BLOCKED` block. A printed `PAUSED` or `BLOCKED` block ends the session; it does not mean the PR is built. `/ratchet run` hands the same text to one background build agent per PR; nobody answers its questions, so it stops wherever this protocol stops.
