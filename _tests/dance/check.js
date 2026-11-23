// The Dance Stage's quality check. usage: node _tests/dance/check.js [--update] [--all] [--page path/to/index.html] [--json out.json]
// It opens the page headless, runs the page's own self-test, measures every style and move (quality.js), and then
//   1. fails on defects: the floors below, which nothing on the page may fall under;
//   2. fails on drift: any style or move that no longer measures as it did in baseline.json;
//   3. fails if anything the owner rejected (verdicts.json) is back on the page;
//   4. reports, without failing, what is new, what nobody has judged yet, and what is unlike the owner's favourites.
// listen.js, beside this file, asks models that can hear or read music for a second opinion. It needs a key and the network, so it is not part of this check.
// --update accepts the page as it is now as the new baseline. Do that only for changes that were meant, and say which in the commit.
const fs = require('fs'), path = require('path');
const { chromium } = require('playwright');
const HERE = __dirname, REPO = path.resolve(HERE, '../..');
const arg = n => { const i = process.argv.indexOf(n); return i < 0 ? null : process.argv[i + 1] || true; };
const PAGE = path.resolve(arg('--page') && arg('--page') !== true ? arg('--page') : path.join(REPO, 'dance/index.html'));
const BASE = path.join(HERE, 'baseline.json'), VERD = path.join(HERE, 'verdicts.json');

// Floors: set at the worst value of anything now on the page, with a little room. They do not say a thing is good, only that it is not broken in a way a number can see.
const FLOOR = {
  style: { clash: ['<=', .08, 'notes a semitone apart sounding together'], offKey: ['<=', .16, 'too many notes outside its own scale'], pulse: ['>=', .45, 'no clear pulse'], repeat: ['>=', .5, 'the bar-to-bar rhythm does not hold'],
    harsh: ['<=', -16, 'sustained sound in the 2.5 to 4.5 kHz band, where the ear tires'], low: ['>=', -20, 'no low end'], level: ['within', [-22.5, -11], 'overall level out of line with the other styles'] },
  move: { floor: ['>=', -1, 'a joint goes through the floor'], motion: ['>=', 10, 'he barely moves'], apart: ['>=', 3.5, 'almost the same shapes as another move'] }
};
// Drift: how far a measure may differ from the baseline before it counts as a change. Run-to-run noise is under a fifth of each.
const TOL = { style: { level: .3, low: .4, harsh: .6, fill: .03, onBeat: .1, pulse: .05, repeat: .05, backbeat: .1, loudVar: .04, clash: .005, tuneNotes: .01, voices: 0, lowBeats: .01, drumBeats: .01, sync: .01, bpm: 0, offKey: .01, pitchSum: 0 },
  move: { motion: .5, lock: .02, bob: .3, sway: .3, box: .03, reach: .5, shapes: 0, floor: .3, apart: .3, travel: .5, handsUp: .02 } };
const pack = g => g.replace(/(\d)\1{4,}/g, (m, d) => d + '(' + m.length + ')'), unpack = g => g.replace(/(\d)\((\d+)\)/g, (m, d, n) => d.repeat(+n));      // the pictures are mostly empty, so runs of one digit are written short
const ENVELOPE = ['level', 'low', 'harsh', 'fill', 'onBeat', 'pulse', 'repeat', 'backbeat', 'loudVar', 'lowBeats'];   // the measures on which a style is compared with the favourites

(async () => {
  const verdicts = JSON.parse(fs.readFileSync(VERD, 'utf8')), base = fs.existsSync(BASE) ? JSON.parse(fs.readFileSync(BASE, 'utf8')) : null;
  const fails = [], changed = [], notes = [];
  if (!arg('--page')){
    const pub = path.join(REPO, 'docs/dance/index.html');
    if (!fs.existsSync(pub) || !fs.readFileSync(pub).equals(fs.readFileSync(PAGE))) fails.push('docs/dance/index.html is not a copy of dance/index.html (the site serves the copy)');
  }
  const browser = await chromium.launch({ args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'] });
  const page = await (await browser.newContext({ viewport: { width: 432, height: 760 }, deviceScaleFactor: 1 })).newPage();
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.route('**/fonts.g*/**', r => r.abort());
  await page.addInitScript(() => { window.requestAnimationFrame = () => 0; });      // the page stands still, so that every run draws the same pictures
  await page.goto('file://' + PAGE); await page.waitForTimeout(200);
  const self = await page.evaluate(() => window.ceoDanceSelfTest());
  for (const f of self.failed) fails.push('self-test, ' + f.group + ': ' + f.note);
  if (!(await page.evaluate(() => !!window.ceoDanceLab))){ console.log('This page has no test bench (window.ceoDanceLab).'); await browser.close(); process.exit(2); }
  await page.addScriptTag({ path: path.join(HERE, 'quality.js') });
  const Q = await page.evaluate(() => window.ceoDanceQuality());
  await browser.close();
  for (const e of errors) fails.push('script error: ' + e);
  if (arg('--json') && arg('--json') !== true) fs.writeFileSync(arg('--json'), JSON.stringify(Q, null, 1));

  // 1. floors
  const under = (kind, id, m) => { for (const k in FLOOR[kind]){ const [op, lim, why] = FLOOR[kind][k], v = m[k]; const ok = op === '<=' ? v <= lim : op === '>=' ? v >= lim : v >= lim[0] && v <= lim[1]; if (!ok) fails.push(`${kind} ${id}: ${why} (${k} ${v}, allowed ${op} ${lim})`); } };
  for (const s in Q.styles) under('style', s, Q.styles[s]);
  for (const m in Q.moves) under('move', m, Q.moves[m]);
  // 2. nothing rejected has come back
  for (const kind of ['styles', 'moves']) for (const id in verdicts.rejected[kind]) if (Q[kind][id]) fails.push(`${kind.slice(0, -1)} "${id}" was rejected by the owner ("${verdicts.rejected[kind][id].said}") and is on the page again`);
  // 3. drift from the baseline
  const fresh = [], gone = [];
  if (base) for (const [kind, key] of [['style', 'styles'], ['move', 'moves']]){
    for (const id in Q[key]){
      const now = Q[key][id], was = base[key][id]; if (!was){ fresh.push(kind + ' ' + id); continue; }
      const d = [];
      for (const k in TOL[kind]) if (was[k] !== undefined && Math.abs(now[k] - was[k]) > TOL[kind][k] + 1e-9) d.push(`${k} ${was[k]} -> ${now[k]}`);
      if (kind === 'style'){ let w = 0; now.profile.forEach((v, i) => { w = Math.max(w, Math.abs(v - was.profile[i])); }); if (w > .02) d.push('where in the bar it hits (by ' + w.toFixed(3) + ')'); w = 0; if (was.keys) now.keys.forEach((v, i) => { w = Math.max(w, Math.abs(v - was.keys[i])); }); if (w > .005) d.push('which notes it plays (by ' + w.toFixed(3) + ')'); }
      else { const pics = Q.pictures[id], old = (base.pictures[id] || []).map(unpack); let ink = 0; pics.forEach((g, i) => { for (let c = 0; c < g.length; c++) ink += Math.abs(g[c] - ((old[i] || '')[c] || 0)); }); if (ink >= 3) d.push('how it is drawn (by ' + ink + ', where 9 is one whole cell of ' + pics.join('').length + ')'); }
      if (d.length) changed.push(`${kind} ${id}${(verdicts[key][id] || {}).verdict === 'loved' ? ' [a favourite]' : ''}: ${d.join('; ')}`);
    }
    for (const id in base[key]) if (!Q[key][id]) gone.push(kind + ' ' + id);
  }
  // 4. what to listen to and look at
  const loved = Object.keys(verdicts.styles).filter(s => verdicts.styles[s].verdict === 'loved' && Q.styles[s]), env = {};
  for (const k of ENVELOPE){ const v = loved.map(s => Q.styles[s][k]), lo = Math.min(...v), hi = Math.max(...v), pad = .15 * (hi - lo); env[k] = [lo - pad, hi + pad]; }
  const unlike = {}; for (const s in Q.styles) if (!loved.includes(s)){ const o = ENVELOPE.filter(k => Q.styles[s][k] < env[k][0] || Q.styles[s][k] > env[k][1]); if (o.length) unlike[s] = o.map(k => `${k} ${Q.styles[s][k]}`); }
  const unjudged = kind => Object.keys(Q[kind]).filter(id => !verdicts[kind][id]);
  const weak = Object.keys(Q.moves).map(m => [m, Q.moves[m]]).filter(([, q]) => q.motion < 18 || q.apart < 7 || q.shapes < 2)
    .map(([m, q]) => `${m} (${[q.motion < 18 && 'small: ' + q.motion, q.shapes < 2 && 'one shape', q.apart < 7 && 'close to ' + q.nearest + ': ' + q.apart].filter(Boolean).join(', ')})`);

  const say = (title, list, max) => { if (!list.length) return; console.log('\n' + title); for (const l of list.slice(0, max || 999)) console.log('  ' + l); if (max && list.length > max) console.log('  ... and ' + (list.length - max) + ' more'); };
  console.log(`Dance Stage quality check: ${Object.keys(Q.styles).length} styles, ${Object.keys(Q.moves).length} moves, self-test ${self.total - self.failed.length} of ${self.total}`);
  say('FAILED', fails);
  if (!base) console.log('\nNo baseline yet: run with --update to record one.');
  say('CHANGED SINCE THE BASELINE (meant? then --update and say so in the commit)', changed);
  say('NEW SINCE THE BASELINE (unjudged until the owner has heard and seen it)', fresh);
  say('GONE SINCE THE BASELINE', gone);
  const which = arg('--all') ? Object.keys(unlike) : Object.keys(unlike).filter(s => fresh.includes('style ' + s) || changed.some(c => c.startsWith('style ' + s + ':') || c.startsWith('style ' + s + ' [')));
  say('UNLIKE THE FAVOURITES (' + loved.join(', ') + ') ON', which.map(s => s + ': ' + unlike[s].join(', ')));
  if (!arg('--all')) console.log(`\n${Object.keys(unlike).length} of ${Object.keys(Q.styles).length - loved.length} other styles differ from the favourites on some measure; --all lists them and the moves a number can call weak.`);
  const weakNow = arg('--all') ? weak : weak.filter(w => fresh.includes('move ' + w.split(' ')[0]) || changed.some(c => c.startsWith('move ' + w.split(' ')[0] + ':')));
  say('MOVES A NUMBER CAN CALL WEAK', weakNow);
  console.log(`\nNot yet judged by the owner: ${unjudged('styles').length} styles, ${unjudged('moves').length} moves (verdicts.json lists what has been).`);
  if (arg('--update')){
    const keep = (m, tol, extra) => { const o = {}; for (const k of Object.keys(tol).concat(extra)) o[k] = m[k]; return o; }, out = { styles: {}, moves: {}, pictures: {} };
    for (const m in Q.pictures) out.pictures[m] = Q.pictures[m].map(pack);
    for (const s in Q.styles) out.styles[s] = keep(Q.styles[s], TOL.style, ['profile', 'keys']);
    for (const m in Q.moves) out.moves[m] = keep(Q.moves[m], TOL.move, ['nearest']);
    fs.writeFileSync(BASE, JSON.stringify(out).replace(/("(styles|moves|pictures)":\{|\},|\],")/g, m => m.startsWith('"') ? m + '\n' : m[0] + ',\n' + m.slice(2)) + '\n');
    console.log('\nBaseline updated' + (changed.length + fresh.length + gone.length ? ': ' + (changed.length + fresh.length + gone.length) + ' entries differ from the old one.' : '.'));
    process.exit(fails.length ? 1 : 0);
  }
  const bad = fails.length + changed.length + fresh.length + gone.length;
  console.log(bad ? `\n${fails.length} failed, ${changed.length} changed, ${fresh.length} new, ${gone.length} gone.` : '\nNothing failed and nothing has drifted from the baseline.');
  process.exit(bad ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
