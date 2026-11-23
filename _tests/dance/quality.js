// Measures of the Dance Stage's music and moves. Runs inside the page, on the bench it exposes as window.ceoDanceLab.
// Nothing here is a verdict: it turns sound and movement into numbers, and check.js decides what to do with them.
// Where a measure comes from the research literature its source is named; README.md says how far each one can be trusted.
(() => {
  const SR = 22050, HOP = 110, FT = HOP / SR;                 // sound is looked at every 5 ms
  const PER = 24;                                             // and movement 24 times a beat
  const WJ = [1, 1, 1.5, 1, 1, .5, .5, 1, 1];                 // how much each joint counts toward "how much is he moving": head, chest, hips, hands, elbows, feet
  const mean = a => { let s = 0; for (const v of a) s += v; return a.length ? s / a.length : 0; };
  const pct = (a, q) => { const b = Float64Array.from(a).sort(); return b.length ? b[Math.min(b.length - 1, Math.floor(q * b.length))] : 0; };
  const corr = (a, b) => { const ma = mean(a), mb = mean(b); let n = 0, da = 0, db = 0; for (let i = 0; i < a.length; i++){ n += (a[i] - ma) * (b[i] - mb); da += (a[i] - ma) ** 2; db += (b[i] - mb) ** 2; } return da && db ? n / Math.sqrt(da * db) : 0; };
  const r3 = v => Math.round(v * 1000) / 1000;
  function biquad(x, type, f){                                // one second-order low-pass or high-pass
    const w = 2 * Math.PI * f / SR, c = Math.cos(w), al = Math.sin(w) / Math.SQRT2, a0 = 1 + al;
    const b1 = (type === 'lp' ? 1 - c : -(1 + c)) / a0, b0 = Math.abs(b1) / 2, a1 = -2 * c / a0, a2 = (1 - al) / a0, y = new Float32Array(x.length);
    let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
    for (let i = 0; i < x.length; i++){ const v = b0 * x[i] + b1 * x1 + b0 * x2 - a1 * y1 - a2 * y2; x2 = x1; x1 = x[i]; y2 = y1; y1 = v; y[i] = v; }
    return y;
  }
  const band = (x, lo, hi) => { let y = x; if (lo) y = biquad(biquad(y, 'hp', lo), 'hp', lo); if (hi) y = biquad(biquad(y, 'lp', hi), 'lp', hi); return y; };
  const envelope = y => { const n = Math.floor(y.length / HOP) - 2, e = new Float32Array(Math.max(0, n)); for (let i = 0; i < n; i++){ let s = 0; for (let j = 0; j < 2 * HOP; j++){ const v = y[i * HOP + j]; s += v * v; } e[i] = Math.sqrt(s / (2 * HOP)); } return e; };
  const rise = e => { const o = new Float32Array(e.length); for (let i = 1; i < e.length; i++) o[i] = Math.max(0, Math.log(1 + 200 * e[i]) - Math.log(1 + 200 * e[i - 1])); return o; };   // an onset curve: the envelope compressed as the ear does, and only its rises kept
  const rms = y => { let s = 0; for (let i = 0; i < y.length; i++) s += y[i] * y[i]; return Math.sqrt(s / y.length); };
  const db = v => 20 * Math.log10(v + 1e-9);
  const LHL = [0, -4, -3, -4, -2, -4, -3, -4, -1, -4, -3, -4, -2, -4, -3, -4];   // how strong each sixteenth of the bar is (Longuet-Higgins and Lee 1984)

  async function music(st, bars){
    const lab = window.ceoDanceLab, spb = 60 / st.bpm, x = await lab.sound(st.id, bars, SR), steps = bars * 16;
    const eF = envelope(x), eL = envelope(band(x, 0, 120)), eM = envelope(band(x, 120, 2000)), eH = envelope(band(x, 2000, 0)), eP = envelope(band(x, 2500, 4500));
    const oL = rise(eL), oM = rise(eM), oH = rise(eH), n0 = Math.round(.05 / FT) - 1, n1 = Math.min(eF.length, n0 + Math.round(bars * 4 * spb / FT));
    const o = new Float32Array(n1 - n0), ol = o.map((_, i) => oL[n0 + i]), env = eF.subarray(n0, n1);
    for (let i = 0; i < o.length; i++) o[i] = oL[n0 + i] + oM[n0 + i] + oH[n0 + i];
    const at = b => b * spb / FT;                             // a time in beats, as a frame number
    const sumNear = (c, b, a, z) => { let s = 0; for (let i = Math.max(0, Math.round(at(b) + a / FT)); i < Math.min(c.length, Math.round(at(b) + z / FT)); i++) s += c[i]; return s; };
    const ac = (c, lagBeats) => { const lag = Math.round(at(lagBeats)); return lag < c.length - 8 ? corr(c.subarray(0, c.length - lag), c.subarray(lag)) : 0; };
    // the beat: how much of all the attacking falls on the four beats of the bar, against an even spread; and how strongly the onset curve repeats itself a beat, half a beat and two beats later
    let onb = 0; for (let b = 0; b < bars * 4; b++) onb += sumNear(o, b, -.035, .035);
    const tot = o.reduce((s, v) => s + v, 0) || 1e-9;
    // pulse clarity, after Lartillot et al. 2008: the highest peak of the onset curve's autocorrelation over the lags of 40 to 200 beats a minute
    let pc = 0; for (let l = Math.round(.3 / FT); l <= Math.round(1.5 / FT); l++) if (l < o.length - 8) pc = Math.max(pc, corr(o.subarray(0, o.length - l), o.subarray(l)));
    // sixteenth by sixteenth: where in the bar the sound attacks (all of it, and the low end alone), one row per bar
    const prof = c => Array.from({ length: bars }, (_, k) => Array.from({ length: 16 }, (_, s) => sumNear(c, (k * 16 + s) / 4, -.02, .04)));
    const P = prof(o), PL = prof(ol), fold = M => { const v = new Array(16).fill(0); for (const r of M) r.forEach((q, i) => { v[i] += q; }); const t = v.reduce((s, q) => s + q, 0) || 1; return v.map(q => q / t); };
    const rep = []; for (let k = 0; k + 1 < bars; k++) rep.push(corr(P[k], P[k + 1]));
    const hiM = envelope(band(x, 2000, 0)).subarray(n0, n1), oHM = new Float32Array(o.length); for (let i = 0; i < o.length; i++) oHM[i] = oM[n0 + i] + oH[n0 + i];
    let bb = 0, all = 0; for (let s = 0; s < steps; s++){ const v = sumNear(oHM, s / 4, -.02, .04); all += v; if (s % 8 === 4) bb += v; }
    // the 50 ms loudness curve and how much it varies: the one audio measure Stupacher et al. 2016 found tracking "groove" (r = .57)
    const slow = []; for (let i = 0; i + 10 <= env.length; i += 10){ let s = 0; for (let j = 0; j < 10; j++) s += env[i + j] ** 2; slow.push(Math.sqrt(s / 10)); }
    const ms = mean(slow), sd = Math.sqrt(mean(slow.map(v => (v - ms) ** 2)));
    let lf = 0; for (let i = n0 + 1; i < n1; i++) lf += Math.abs(eL[i] - eL[i - 1]);
    const half = Math.floor(x.length / 2), lowB = band(x, 0, 120);
    // the notes as written: clashes, drums and bass on the beats, syncopation
    const N = lab.notes(st.id, bars), pitched = N.filter(e => e.m !== undefined), drums = N.filter(e => e.drum);
    let clash = 0;
    for (let i = 0; i < pitched.length; i++) for (let j = i + 1; j < pitched.length; j++){
      const a = pitched[i], b = pitched[j]; if (b.t > a.t + a.d + .001 && a.t > b.t + b.d + .001) continue;
      const ov = Math.min(a.t + a.d, b.t + b.d) - Math.max(a.t, b.t); if (ov < .05) continue;
      const iv = Math.abs(Math.round(a.m) - Math.round(b.m)); if (iv % 12 !== 1) continue;                    // a semitone or a minor ninth sounding together
      if (a.v === b.v && Math.abs(a.t - b.t) > .02) continue;                                                // one voice moving by step is a tune, not a clash
      clash += ov * Math.min(a.g, b.g);
    }
    const hasNear = (list, b) => list.some(e => Math.abs(e.t - b * spb) < .045);
    const lows = N.filter(e => e.drum === 'low' || e.low || (e.m !== undefined && e.m < 48)), hits = drums.filter(e => e.drum !== 'high');
    let lowBeats = 0, drumBeats = 0; for (let b = 0; b < bars * 4; b++){ if (hasNear(lows, b)) lowBeats++; if (hasNear(hits, b) || hasNear(lows, b)) drumBeats++; }
    let sync = 0;                                             // Longuet-Higgins and Lee syncopation of the drums that are not hi-hats, per bar
    for (let k = 0; k < bars; k++){
      const on = new Array(16).fill(false); for (const e of hits){ const s = Math.round(e.t / spb * 4); if (s >= k * 16 && s < k * 16 + 16) on[s - k * 16] = true; }
      for (let i = 0; i < 16; i++) if (on[i]){ let R = -9; for (let j = 1; j < 16 && !on[(i + j) % 16]; j++) R = Math.max(R, LHL[(i + j) % 16]); if (R > LHL[i]) sync += R - LHL[i]; }
    }
    const tune = pitched.filter(e => e.m >= 60);
    return {
      level: r3(db(rms(x))), second: r3(db(rms(x.subarray(half)) / (rms(x.subarray(0, half)) + 1e-9))),
      low: r3(db(rms(lowB) / (rms(x) + 1e-9))), harsh: r3(db(pct(eP.subarray(n0, n1), .5) / (pct(env, .5) + 1e-9))), fill: r3(pct(env, .1) / (pct(env, .9) + 1e-9)),
      onBeat: r3(onb / tot / (.07 / spb)), pulse: r3(pc), beatAc: r3(ac(o, 1)), halfAc: r3(ac(o, .5)), barAc: r3(ac(o, 4)), lowAc: r3(Math.max(ac(ol, 1), ac(ol, 2), ac(ol, 4))),
      backbeat: r3(bb / (all / 8 || 1e-9)), repeat: r3(mean(rep)), loudVar: r3(sd / (ms || 1e-9)), lowFlux: r3(lf / (n1 - n0) / (mean(env) || 1e-9)),
      clash: r3(clash / bars), lowBeats: r3(lowBeats / bars), drumBeats: r3(drumBeats / bars), sync: r3(sync / bars), tuneNotes: r3(tune.length / bars), voices: new Set(N.map(e => e.v)).size,
      profile: fold(P).map(r3), lowProfile: fold(PL).map(r3)
    };
  }

  const tracks = {};
  function track(move, bpm){ const key = move + '@' + bpm; return tracks[key] || (tracks[key] = window.ceoDanceLab.track(move, bpm, 16, PER)); }
  function move(id, bpm){
    const J = track(id, bpm), n = J.length, spb = 60 / bpm, WS = WJ.reduce((s, v) => s + v, 0);
    const S = new Float32Array(n), part = Array.from({ length: 9 }, () => 0);
    for (let i = 1; i < n; i++) for (let j = 0; j < 9; j++){ const d = Math.hypot(J[i][2 * j] - J[i - 1][2 * j], J[i][2 * j + 1] - J[i - 1][2 * j + 1]) * PER; S[i] += WJ[j] * d / WS; part[j] += d / (n - 1); }
    S[0] = S[1];
    const m = mean(S), four = k => { let re = 0, im = 0, t = 0; for (let i = 0; i < n; i++){ const a = 2 * Math.PI * k * i / PER; re += S[i] * Math.cos(a); im += S[i] * Math.sin(a); t += S[i]; } return Math.hypot(re, im) / (t || 1e-9); };
    const lk = [four(.5), four(1), four(2)], lock = Math.max(...lk);
    // beat alignment, after Li et al. 2021 (AIST++): the moments he is stillest ("kinematic beats") against the beats of the music, within 50 ms; and the Bailando form, which asks of every beat whether a still moment is near it
    const sm = S.map((v, i) => (S[Math.max(0, i - 1)] + v + S[Math.min(n - 1, i + 1)]) / 3), kb = [];
    for (let i = 1; i < n - 1; i++) if (sm[i] < sm[i - 1] && sm[i] <= sm[i + 1]) kb.push(i / PER);
    const sg = .05 / spb, near = (b, g) => Math.abs(b * g - Math.round(b * g)) / g, gauss = d => Math.exp(-d * d / (2 * sg * sg));
    const alignLi = kb.length ? mean(kb.map(b => gauss(Math.min(near(b, 1), near(b, 2))))) : 0;
    let bai = 0; for (let b = 0; b < 16; b++){ let d = 9; for (const q of kb) d = Math.min(d, Math.abs(q - b), Math.abs(q - b - 16), Math.abs(q - b + 16)); bai += gauss(d); }
    const col = j => J.map(r => r[j]), perBeat = (v, f) => { const o = []; for (let b = 0; b < 16; b++){ const s = v.slice(b * PER, (b + 1) * PER); o.push(f(s)); } return mean(o); }, range = s => Math.max(...s) - Math.min(...s);
    const hy = col(1), hipx = col(4), hipy = col(5);
    let box = 0, up = 0, low = 99, skate = 0, grounded = 0; const reach = [];
    for (let i = 0; i < n; i++){
      const r = J[i]; let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
      for (let j = 0; j < 9; j++){ x0 = Math.min(x0, r[2 * j]); x1 = Math.max(x1, r[2 * j]); y0 = Math.min(y0, r[2 * j + 1]); y1 = Math.max(y1, r[2 * j + 1]); }
      box += (x1 - x0) * (y1 - y0) / n; reach.push(Math.max(Math.hypot(r[6] - r[2], r[7] - r[3]), Math.hypot(r[8] - r[2], r[9] - r[3])));
      if (r[7] > r[1] || r[9] > r[1]) up += 1 / n;
      low = Math.min(low, r[1] - 20, r[5] - 10, r[7] - 5, r[9] - 5, r[15] - 6, r[17] - 6);                 // head, hips, hands and feet, each less its own thickness: below zero is through the floor
      if (i) for (const f of [14, 16]) if (r[f + 1] < 9 && J[i - 1][f + 1] < 9){ grounded++; if (Math.abs(r[f] - J[i - 1][f]) * PER > 30) skate++; }   // a foot on the floor that is sliding (the "foot skating ratio" of the motion-synthesis papers)
    }
    // how many different shapes he makes: the poses on each half beat, grouped when all joints are within about a hand's width
    const keys = []; for (let i = 0; i < n; i += PER / 2){ const r = J[i], c = r.map((v, q) => q % 2 ? v : v - r[4]); if (!keys.some(k => Math.sqrt(mean(k.map((v, q) => (v - c[q]) ** 2))) < 9)) keys.push(c); }
    const acc = new Array(16).fill(0), spd = new Array(16).fill(0);                                          // sixteenth by sixteenth through a bar of four beats: where he arrives (slows sharply) and where he is moving
    for (let i = 1; i < n; i++){ const s = Math.round(i / PER * 4) % 16; acc[s] += Math.max(0, S[i - 1] - S[i]); spd[s] += S[i]; }
    const norm = v => { const t = v.reduce((s, q) => s + q, 0) || 1; return v.map(q => r3(q / t)); };
    const lr = (a, b) => r3(Math.min(part[a], part[b]) / (Math.max(part[a], part[b]) || 1e-9));
    return {
      motion: r3(m), lock: r3(lock), lockAt: [.5, 1, 2][lk.indexOf(lock)], hit: r3(pct(S, .95) / (m || 1e-9)), still: r3(S.filter(v => v < .2 * m).length / n),
      alignLi: r3(alignLi), alignBai: r3(bai / 16), bob: r3(perBeat(hy, range)), hipBob: r3(perBeat(hipy, range)), sway: r3(perBeat(hipx, range)), travel: r3(range(hipx)),
      box: r3(box / 1e4), reach: r3(pct(reach, .9)), handsUp: r3(up), shapes: keys.length, hands: lr(3, 4), feet: lr(7, 8), arms: r3((part[3] + part[4]) / 2), legs: r3((part[7] + part[8]) / 2), core: r3((part[0] + part[2]) / 2),
      floor: r3(low), skate: r3(grounded ? skate / grounded : 0), accent: norm(acc), speed: norm(spd)
    };
  }
  // how alike two moves are: the mean distance between their joints on each half beat, trying every start beat and the mirror image
  function likeness(a, b, bpm){
    const A = track(a, bpm), B = track(b, bpm), idx = [], MIR = [0, 1, 2, 4, 3, 6, 5, 8, 7]; let best = 1e9;
    for (let i = 0; i < A.length; i += PER / 2) idx.push(i);
    for (const mir of [false, true]) for (let sh = 0; sh < 16; sh += 1){
      let s = 0;
      for (const i of idx){ const p = A[i], q = B[(i + sh * PER) % B.length], px = p[4], qx = q[4]; for (let j = 0; j < 9; j++){ const k = mir ? MIR[j] : j, dx = (p[2 * j] - px) - (mir ? -(q[2 * k] - qx) : q[2 * k] - qx), dy = p[2 * j + 1] - q[2 * k + 1]; s += Math.hypot(dx, dy); } }
      best = Math.min(best, s / idx.length / 9);
    }
    return best;
  }

  window.ceoDanceQuality = async (opt = {}) => {
    const lab = window.ceoDanceLab, styles = lab.styles(), moves = lab.moves(), out = { styles: {}, moves: {}, pairs: {}, pictures: {} }, bars = opt.bars || 8;
    const home = {};                                          // each move is danced at the tempo of the first style that plays it
    for (const st of styles) for (const m of st.auto) if (!(m in home)) home[m] = st.bpm;
    for (const st of styles) if (!opt.only || opt.only.styles.includes(st.id)) out.styles[st.id] = Object.assign({ bpm: st.bpm, tab: st.tab }, await music(st, bars));
    for (const mv of moves) if (!opt.only || opt.only.moves.includes(mv.id)){
      out.moves[mv.id] = Object.assign({ tab: mv.tab, bpm: home[mv.id] || 120 }, move(mv.id, home[mv.id] || 120));
      out.pictures[mv.id] = [.5, 1.5, 2.5, 5.5].map(b => lab.picture(mv.id, b, 24, 20));
    }
    // each style with each of its own moves: does he arrive where the music hits? (the correlation, through the bar, of his arrivals with the music's attacks)
    for (const st of styles) if (out.styles[st.id]) for (const m of new Set(st.auto)){
      const q = move(m, st.bpm); out.pairs[st.id + '/' + m] = { arrive: r3(corr(out.styles[st.id].profile, q.accent)), moving: r3(corr(out.styles[st.id].profile, q.speed)) };
    }
    if (!opt.only){                                           // every move against every other: its nearest neighbour
      const ids = moves.map(m => m.id);
      for (const a of ids){ let best = [null, 1e9]; for (const b of ids) if (a !== b){ const d = likeness(a, b, 120); if (d < best[1]) best = [b, d]; } out.moves[a].nearest = best[0]; out.moves[a].apart = r3(best[1]); }
    }
    return out;
  };
})();
