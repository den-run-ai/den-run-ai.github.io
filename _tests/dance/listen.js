// A second opinion on the Dance Stage's music from models that can hear it or read it. Advisory: it never passes or fails anything, and README.md says how far it can be trusted.
// usage: OPENROUTER_API_KEY=... node _tests/dance/listen.js [--styles a,b] [--reps 3] [--ears model,model] [--reader model] [--json out.json] [--page path/to/index.html]
// It renders eight bars of each style, plays them blind to the "ears" and gives the written notes to the "reader", and asks each for marks and for the weakest thing.
// Every run starts with a control: House with three notes in ten moved a semitone. A model that does not mark that down is left out of the report.
// The sound and the notes of the page's music are sent to OpenRouter and on to the model's maker; nothing else is. The key is read from the environment only: never write it into this repository.
const fs = require('fs'), os = require('os'), path = require('path');
const { chromium } = require('playwright');
const HERE = __dirname, REPO = path.resolve(HERE, '../..');
const arg = (n, d) => { const i = process.argv.indexOf(n); return i < 0 || !process.argv[i + 1] ? d : process.argv[i + 1]; };
const PAGE = path.resolve(arg('--page', path.join(REPO, 'dance/index.html'))), KEY = (process.env.OPENROUTER_API_KEY || '').trim();
const EARS = arg('--ears', 'google/gemini-4-argon,google/gemini-4-carbon').split(','), READER = arg('--reader', 'google/gemini-4-argon'), REPS = +arg('--reps', 3), BARS = 8, SR = 22050, CONTROL = 'house';
if (!KEY){ console.log('Set OPENROUTER_API_KEY in the environment first (a key from openrouter.ai; a full run of every style costs about a dollar).'); process.exit(2); }

const SCALE = `Answer with one JSON object and nothing else:
{
 "genre": "your best guess at the genre it is meant to be, 1 to 3 words",
 "other_genres": ["second guess", "third guess"],
 "bpm": <number>,
 "pulse": <1-10: how clear and steady the beat is for a dancer to follow>,
 "groove": <1-10: how much the rhythm makes you want to move>,
 "harmony": <1-10: how well the notes fit together; 1 means wrong or clashing notes>,
 "melody": <1-10: is there a tune worth humming>,
 "authentic": <1-10: how much it sounds like a real example of the genre you named>,
 "overall": <1-10: how much would someone enjoy dancing to it for a minute>,
 "weakest": "one sentence: the weakest thing about it",
 "heard": "one sentence: the instruments and the rhythm you hear"
}
Use the whole range of each scale; 5 is an average amateur loop.`;
const BY_EAR = 'Listen to this short loop. It is instrumental dance music played by a very simple synthesizer inside a web page (plain oscillators, and noise for drums), so ignore the cheap sound and judge the writing: the rhythm, the notes and the arrangement.\n\n' + SCALE;
const BY_EYE = score => 'Below is the full score of a short loop of instrumental dance music, written for a very simple synthesizer inside a web page. Read it as a musician would and judge the writing: the rhythm, the notes and the arrangement. You cannot hear it; reason from the notes.\n\n' + score + '\n\n'
  + SCALE.replace('"heard": "one sentence: the instruments and the rhythm you hear"', '"heard": "one sentence: the key, the chords and the drum pattern you read"');

const NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'], name = m => NAMES[((Math.round(m) % 12) + 12) % 12] + (Math.floor(Math.round(m) / 12) - 1);
function score(bpm, notes){                                   // the notes as a tracker sheet: one line per sixteenth, the drums and then each voice
  const spb = 60 / bpm, steps = {}, voices = [...new Set(notes.filter(e => e.m !== undefined).map(e => e.v))].sort();
  for (const e of notes) (steps[e.n] = steps[e.n] || []).push(e);
  const out = [`Tempo ${bpm} beats a minute. One line per step, four steps to a beat, 16 steps to a bar. Drums: K kick or low drum, S snare, clap or mid drum, h hat or shaker; a capital H is a loud one. Then each pitched voice with its notes (name and octave, length in steps). Voices: ${voices.join(', ')}.`];
  for (let n = 0; n <= Math.max(...Object.keys(steps).map(Number)); n++){
    if (n % 16 === 0) out.push('-- bar ' + (n / 16 + 1));
    const ev = steps[n] || [], hi = ev.filter(e => e.drum === 'high'), by = {};
    for (const e of ev) if (e.m !== undefined) (by[e.v] = by[e.v] || []).push(name(e.m) + '/' + Math.max(1, Math.round(e.d / (spb / 4))));
    out.push(String(n % 16 + 1).padStart(2) + ' ' + (ev.some(e => e.drum === 'low') ? 'K' : '.') + (ev.some(e => e.drum === 'mid') ? 'S' : '.') + (hi.length ? (Math.max(...hi.map(e => e.g)) > .2 ? 'H' : 'h') : '.')
      + Object.keys(by).map(v => `  ${v}: ${by[v].join(' ')}`).join(''));
  }
  return out.join('\n');
}
const dice = seed => { let z = seed; return () => (z = (z * 16807) % 2147483647) / 2147483647; };
const wrongNotes = notes => { const rnd = dice(777); return notes.map(e => e.m !== undefined && e.v !== 'sub' && rnd() < .3 ? Object.assign({}, e, { m: e.m + 1 }) : e); };
const WRONG_ON = `window.__kept = [tone, lead, pluck, ep]; { let z = 777; const rnd = () => (z = (z * 16807) % 2147483647) / 2147483647, [T, L, P, E] = window.__kept;
  tone = (t, f, ...a) => T(t, f * (rnd() < .3 ? 1.05946 : 1), ...a); lead = (t, f, ...a) => L(t, f * (rnd() < .3 ? 1.05946 : 1), ...a); pluck = (t, m, ...a) => P(t, m + (rnd() < .3 ? 1 : 0), ...a); ep = (t, m, ...a) => E(t, m + (rnd() < .3 ? 1 : 0), ...a); }`;
const WRONG_OFF = '[tone, lead, pluck, ep] = window.__kept;';

let spent = 0;
async function ask(model, content){
  const body = { model, messages: [{ role: 'user', content }], max_tokens: 6000, usage: { include: true }, reasoning: { effort: 'low' } };
  for (let i = 0; i < 3; i++){
    try {
      const r = await fetch('https://openrouter.ai/api/v1/chat/completions', { method: 'POST', headers: { Authorization: 'Bearer ' + KEY, 'Content-Type': 'application/json' }, body: JSON.stringify(body) }), j = await r.json();
      if (r.status === 401 || r.status === 402){ console.log('OpenRouter refused the key or it is out of credit: ' + JSON.stringify(j.error || j).slice(0, 200)); process.exit(2); }
      const t = j.choices && j.choices[0].message.content, m = typeof t === 'string' && t.match(/\{[\s\S]*\}/); spent += (j.usage && j.usage.cost) || 0;
      if (m) try { return JSON.parse(m[0].replace(/,\s*([}\]])/g, '$1')); } catch (e){}
    } catch (e){}
    await new Promise(f => setTimeout(f, 2000 * (i + 1)));
  }
  return null;
}
const pool = async (jobs, n) => { let i = 0; await Promise.all(Array.from({ length: n }, async () => { while (i < jobs.length) await jobs[i++](); })); };
const avg = (list, k) => { const v = list.map(p => +p[k]).filter(Number.isFinite); return v.length ? v.reduce((s, x) => s + x, 0) / v.length : NaN; }, f1 = v => Number.isFinite(v) ? v.toFixed(1) : ' -- ';

(async () => {
  const html = fs.readFileSync(PAGE, 'utf8'), mark = 'window.ceoDanceLab = {', tmp = path.join(os.tmpdir(), `dance-listen-${process.pid}.html`);
  if (!html.includes(mark)){ console.log('This page has no test bench (window.ceoDanceLab).'); process.exit(2); }
  fs.writeFileSync(tmp, html.replace(mark, 'window.__bench = c => eval(c);\n' + mark));       // a way in for the control's damage, in a copy of the page that is thrown away
  const browser = await chromium.launch({ args: ['--no-sandbox'] }), page = await browser.newPage();
  await page.route('**/fonts.g*/**', r => r.abort()); await page.addInitScript(() => { window.requestAnimationFrame = () => 0; });
  await page.goto('file://' + tmp); await page.waitForTimeout(200);
  const all = await page.evaluate(() => window.ceoDanceLab.styles()), want = arg('--styles', '') ? arg('--styles').split(',') : all.map(s => s.id);
  const render = (id, wrong) => page.evaluate(async ([id, bars, sr, on, off]) => {
    if (on) window.__bench(on);
    let x; try { x = await window.ceoDanceLab.sound(id, bars, sr); } finally { if (on) window.__bench(off); }
    let pk = 0; for (let i = 0; i < x.length; i++) pk = Math.max(pk, Math.abs(x[i]));
    const pcm = new Int16Array(x.length); for (let i = 0; i < x.length; i++) pcm[i] = Math.round(x[i] * .89 / (pk || 1) * 32767);
    const u = new Uint8Array(pcm.buffer); let bin = ''; for (let i = 0; i < u.length; i += 8192) bin += String.fromCharCode.apply(null, u.subarray(i, i + 8192));
    return { pcm: btoa(bin), notes: window.ceoDanceLab.notes(id, bars) };
  }, [id, BARS, SR, wrong ? WRONG_ON : null, WRONG_OFF]);
  const wav = b64 => { const pcm = Buffer.from(b64, 'base64'), h = Buffer.alloc(44); h.write('RIFF', 0); h.writeUInt32LE(36 + pcm.length, 4); h.write('WAVEfmt ', 8); h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22);
    h.writeUInt32LE(SR, 24); h.writeUInt32LE(SR * 2, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34); h.write('data', 36); h.writeUInt32LE(pcm.length, 40); return Buffer.concat([h, pcm]).toString('base64'); };
  const clips = {};
  for (const id of [...new Set([CONTROL, ...want])]){ const st = all.find(s => s.id === id); if (!st){ console.log('No style called ' + id); continue; } const r = await render(id); clips[id] = { audio: wav(r.pcm), score: score(st.bpm, r.notes), notes: r.notes, bpm: st.bpm }; }
  const bad = await render(CONTROL, true); clips['control'] = { audio: wav(bad.pcm), score: score(clips[CONTROL].bpm, wrongNotes(clips[CONTROL].notes)) };
  await browser.close(); fs.unlinkSync(tmp);

  const got = {}, put = (who, id, p) => { if (p) ((got[who] = got[who] || {})[id] = got[who][id] || []).push(p); }, jobs = [];
  for (const id of Object.keys(clips)) for (let r = 0; r < REPS; r++){
    for (const m of EARS) jobs.push(async () => put('ear ' + m, id, await ask(m, [{ type: 'text', text: BY_EAR }, { type: 'input_audio', input_audio: { data: clips[id].audio, format: 'wav' } }])));
    if (READER !== 'none' && r < 2) jobs.push(async () => put('eye ' + READER, id, await ask(READER, [{ type: 'text', text: BY_EYE(clips[id].score) }])));
  }
  console.log(`Asking ${EARS.length} listening and ${READER === 'none' ? 0 : 1} reading model about ${Object.keys(clips).length - 1} styles: ${jobs.length} questions...`);
  await pool(jobs, 8);

  // the control: who marked the damaged House at least two points lower for harmony
  const trusted = [];
  console.log('\nControl: House with three notes in ten moved a semitone.');
  for (const who of Object.keys(got)){ const a = avg(got[who][CONTROL] || [], 'harmony'), b = avg(got[who].control || [], 'harmony'), ok = a - b >= 2; if (ok) trusted.push(who);
    console.log(`  ${who.slice(4)} ${who.startsWith('ear') ? 'by ear' : 'reading the notes'}: harmony ${f1(a)} -> ${f1(b)}  ${ok ? 'noticed' : 'DID NOT NOTICE: left out below'}`); }
  const ears = trusted.filter(w => w.startsWith('ear')), eyes = trusted.filter(w => w.startsWith('eye')), rows = [];
  for (const id of want.filter(id => clips[id])){
    const heard = ears.flatMap(w => got[w][id] || []), read = eyes.flatMap(w => got[w][id] || []);
    rows.push({ id, harmony: avg(heard, 'harmony'), melody: avg(heard, 'melody'), overall: avg(heard, 'overall'), read: avg(read, 'harmony'), called: [...new Set(heard.map(p => String(p.genre).toLowerCase()))].slice(0, 3).join(', '),
      said: heard.map(p => p.weakest).filter(Boolean), saw: read.map(p => p.weakest).filter(Boolean) });
  }
  console.log(`\n${'style'.padEnd(12)} harmony  tune  harmony   what the listeners called it\n${''.padEnd(12)} by ear  by ear  as read`);
  for (const r of rows.slice().sort((a, b) => (a.harmony || 99) - (b.harmony || 99))) console.log(`${r.id.padEnd(12)} ${f1(r.harmony).padStart(5)}  ${f1(r.melody).padStart(5)}   ${f1(r.read).padStart(5)}    ${r.called}`);
  const flag = rows.filter(r => r.harmony < 7.05 || r.melody < 5 || r.read < 7);
  if (flag.length) console.log('\nWORTH A LISTEN (harmony by ear 7 or under, tune under 5, or harmony as read under 7). Check each remark against the notes before acting: some are wrong.');
  for (const r of flag){ console.log(`  ${r.id}: harmony by ear ${f1(r.harmony)}, tune ${f1(r.melody)}, harmony as read ${f1(r.read)}`); for (const s of r.said.slice(0, 2)) console.log('     heard: ' + s); for (const s of r.saw.slice(0, 1)) console.log('     read:  ' + s); }
  console.log(`\nThese models can tell wrong notes and a missing tune. They do not hear an unsteady beat or a missing drum, they misname most genres, and their marks do not predict what the owner likes (README.md). Spent $${spent.toFixed(2)}.`);
  if (arg('--json', '')) fs.writeFileSync(arg('--json'), JSON.stringify({ trusted, rows, got }, null, 1));
})().catch(e => { console.error(e); process.exit(2); });
