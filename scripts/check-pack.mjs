#!/usr/bin/env node
// Checks a ratchet build pack's shape: README sections, chapter format,
// checkpoint fields and each goal's contract. Prints OK or one line per problem.
// Usage: node check-pack.mjs <pack dir>
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';

const pack = process.argv[2];
if (!pack || !existsSync(pack)) {
  console.error('usage: check-pack.mjs <pack dir>');
  process.exit(2);
}
const problems = [];
const warnings = [];
const bad = (where, what) => problems.push(`${where}: ${what}`);

const readme = join(pack, 'README.md');
if (!existsSync(readme)) bad('README.md', 'missing');
else {
  const text = readFileSync(readme, 'utf8');
  for (let i = 1; i <= 8; i++) {
    if (!new RegExp(`^## §${i} `, 'm').test(text)) bad('README.md', `no "## §${i}" section`);
  }
  if (text.includes('{{')) bad('README.md', 'unfilled {{…}} placeholder');
}

const setup = join(pack, 'setup-worktree.sh');
if (!existsSync(setup)) bad('setup-worktree.sh', 'missing');
else {
  if (!(statSync(setup).mode & 0o111)) bad('setup-worktree.sh', 'not executable');
  if (/@[A-Z_]+@/.test(readFileSync(setup, 'utf8'))) bad('setup-worktree.sh', 'unfilled @…@ token');
}
if (!existsSync(join(pack, 'REVIEW_PROMPT'))) bad('REVIEW_PROMPT', 'missing');
else if (readFileSync(join(pack, 'REVIEW_PROMPT'), 'utf8').includes('{{')) bad('REVIEW_PROMPT', 'unfilled {{…}} placeholder');
if (!existsSync(join(pack, 'approvals'))) bad('approvals/', 'missing');

const SECTIONS = ['Scope', 'Decisions honoured', 'Verified facts', 'Files', 'Docs landed', 'Checkpoints', 'PR-level proof', 'Hand-off', 'Goal'];
const chapters = readdirSync(pack).filter((f) => /^pr\d+-.+\.md$/.test(f)).sort((a, b) => parseInt(a.slice(2)) - parseInt(b.slice(2)));
if (chapters.length === 0) bad('pack', 'no pr<n>-<slug>.md chapters');

for (const file of chapters) {
  const n = parseInt(file.slice(2));
  const text = readFileSync(join(pack, file), 'utf8');
  const h1 = text.split('\n')[0];
  if (!new RegExp(`^# PR${n} · \`[a-z]+(\\([^)]+\\))?!?: .+\`$`).test(h1)) bad(file, `H1 is not "# PR${n} · \`type(scope): summary\`"`);
  if (text.includes('{{')) bad(file, 'unfilled {{…}} placeholder');

  const heads = [...text.matchAll(/^## (.+)$/gm)].map((m) => m[1].trim());
  let at = -1;
  for (const s of SECTIONS) {
    const i = heads.findIndex((h, k) => k > at && h.startsWith(s));
    if (i === -1) bad(file, `section "## ${s}" missing or out of order`);
    else at = i;
  }

  const body = (name) => {
    const m = text.match(new RegExp(`^## ${name}[^\\n]*\\n([\\s\\S]*?)(?=^## |(?![\\s\\S]))`, 'm'));
    return m ? m[1] : '';
  };
  const filesSection = body('Files');
  const cps = body('Checkpoints').split(/^(?=\*\*pr\d+\.c\d+[a-z]? · )/m).filter((b) => b.startsWith('**pr'));
  if (cps.length === 0) bad(file, 'no checkpoints');
  if (cps.length > 5) warnings.push(`${file}: ${cps.length} checkpoints; over 5 usually means two PRs`);
  let expect = 1;
  for (const cp of cps) {
    const [, pn, k, suffix] = cp.match(/^\*\*pr(\d+)\.c(\d+)([a-z]?)/);
    const id = `pr${pn}.c${k}${suffix}`;
    if (+pn !== n) bad(file, `${id} belongs to PR ${pn}`);
    if (!suffix) {
      if (+k !== expect) bad(file, `${id} out of sequence (expected c${expect})`);
      expect = +k + 1;
    }
    if (!/\*\*(Behaviour|Migration)[^*]*\*\*/.test(cp)) bad(file, `${id} has no **Behaviour:** (or **Migration**)`);
    if (!/\*\*Tests first/.test(cp) && !/tests_first: no/.test(cp)) bad(file, `${id} has neither **Tests first** nor tests_first: no`);
    if (/\*\*Tests first/.test(cp) && !/\*\*Negatives?:?\*\*/i.test(cp)) bad(file, `${id} lists no **Negative** case`);
    if (!/`depends_on`/.test(cp)) bad(file, `${id} has no \`depends_on\``);
    const ownFiles = /\*\*Files:\*\*/.test(cp) || new RegExp(`^- \\*\\*c${k}${suffix}[:*]`, 'm').test(filesSection);
    if (!ownFiles) bad(file, `${id} declares no files (in the checkpoint or ## Files)`);
  }

  const goal = body('Goal').match(/```\n([\s\S]*?)\n```/);
  if (!goal) bad(file, 'no fenced goal text under ## Goal');
  else {
    const g = goal[1];
    if (g.length >= 4000) bad(file, `goal is ${g.length} chars (limit 4000)`);
    const needs = [`PR ${n} REPORT`, `PR ${n} BLOCKED`, 'approvals/plan', 'turns', 'README §4'];
    if (/⏸/.test(body('Checkpoints'))) needs.push(`PR ${n} PAUSED`);
    for (const s of needs) if (!g.includes(s)) bad(file, `goal does not mention "${s}"`);
    if (!/never merge/i.test(g)) bad(file, 'goal does not say never merge');
  }
}

for (const w of warnings) console.log(`warning: ${w}`);
if (problems.length) {
  console.log(problems.join('\n'));
  process.exit(1);
}
console.log(`OK (${chapters.length} chapters)`);
