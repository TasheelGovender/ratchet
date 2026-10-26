# PR{{N}} · `{{TITLE}}`

_Chapter of the {{PACK_NAME}} build pack. README §1 wins over this chapter where they disagree; `{{PLAN_FILE}}` wins over both._

## Scope

- What this PR makes true, in the plan's words, with a pointer to the plan section.
- What it changes in contracts, routes, schema, worker or UI.
- **Not in this PR:** what the next PRs do, by number.

Branch `{{BRANCH}}` from {{BASE_TEXT}}.

## Decisions honoured

§1.x, §1.y (the README decisions this PR acts on).

## Verified facts (main `{{BASE_SHA}}`)

Grouped by area. Each fact is `path:line` plus what is there, enough for the session to notice drift. Name the existing tests this PR deletes or rewrites, and the fixtures it relies on.

## Files

- **c1:** files, NEW marked, DELETE marked.
- **c2:** …

## Docs landed

- c<k>: the doc and section that changes with the checkpoint that changes the behaviour.

## Checkpoints

**pr{{N}}.c1 · <one behaviour, as a sentence>**
- **Behaviour:** what is true after this commit, precisely enough to judge a diff against.
- **Tests first** (`<test file>`): each case and what it asserts. **Negative:** at least one case that fails when the behaviour is done wrong.
- **Constraints:** what it must not do (no migration, one transaction, …). Omit if none.
- `depends_on`: none | pr{{N}}.c<k>.

(Mark a pause with ⏸ after the bold line and say what triggers it. A removal-only checkpoint replaces **Tests first** with `tests_first: no` and where it is proved.)

## PR-level proof

- The local PR gate, the CI jobs that must be green on the head, and any proof figure the report carries.

## Hand-off

- What the next PR relies on this one having done, and what is deliberately left for it.

## Goal

```
{{GOAL}}
```
