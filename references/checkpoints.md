# Partitioning: PRs and checkpoints

The owner's bar: checkpoints are **useful but not excessive**. Each one is a marker a fresh session can resume from, and a commit a reviewer reads in one sitting.

## PRs

- **One linear stack.** Each PR branches from the one before and moves onto main when that one merges. Parallel PRs only when they share no file; the shared routing, API and fake files of a UI usually rule that out.
- **Cut where a deploy matters.** A migration runs before its PR's code deploys, while the previous PR's code still serves (expand–contract). Removing a column or value the serving code still names is its own later PR, built after the one before is **deployed** (not just merged). Mark those PRs `main, after PR <n> is deployed` in README §2's Base column, and say so in their goal's base rule; `/ratchet run` stops before them.
- **Contract with its consumers.** A contract change ships with its regenerated client and the console's use of it in the same PR, so the UI gate stays green on every merge.
- **Size.** A PR over 5 checkpoints, or one whose checkpoints touch unrelated areas, is two PRs.
- **Title.** Conventional commit, `type(scope): what an operator or caller can now do`. No pack keys or PR numbers in titles.

## Checkpoints

A checkpoint is one **behaviour**: something an operator, a caller or a test can observe, written as a sentence ("An upload checks the whole list and applies it in one transaction, or refuses it with every refused row").

- **Its own red test.** Each checkpoint lists the tests it writes first and what they assert, including at least one **negative** case. A checkpoint that would have no failing test of its own merges into its neighbour. Pure removals and deletions are `tests_first: no`, naming where they are proved (a later checkpoint's test, a CI job).
- **Green at every commit.** The checkpoint gate passes on each commit. Move a contract file with the server checkpoint that changes it, and regenerate the client in the console checkpoint that uses it.
- **Order.** Pure core first, then the transaction and storage, then the route and wiring, then the UI. `depends_on` names the earlier checkpoints it builds on.
- **Declared files.** Every file it touches, NEW ones marked. A file outside the list needs a one-line reason in its commit body, so list generously the files the change obviously needs (a test helper, a barrel `index.ts`).
- **Test budget.** The listed cases are the ceiling. Keep the list to the cases that would catch the checkpoint done wrong; extra ideas go in the chapter's PR-level "Suggested tests" note, not the checkpoint.
- **Facts it rests on.** Cite `file:line` at the pinned sha in the chapter's Verified facts so the session can detect drift.
- **Count.** 1–5 per PR. A one-checkpoint PR is fine for a migration-only contract step.

## Pause points (⏸)

Only where the owner's judgement is the input: look at a new screen (screenshots at named sizes, absolute paths printed), or a measured number crossing a stated threshold. Each pause names the approval file (`approvals/pr<n>.c<k>`) that lets a resumed goal continue, and what the owner chooses between. A pause that is a formality is cut.

## Proofs beyond tests

Timing runs, data-step output, audit queries: state exactly how they are run (database, fixture, settings), that they are not committed, and which figure goes in the report block's `proof:` line.
