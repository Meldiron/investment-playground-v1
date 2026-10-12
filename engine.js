(function (root) {
  const Z_STRIDE = 1320;

  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function normals(seed, paths) {
    const n = paths * Z_STRIDE, rnd = mulberry32(seed), out = new Float32Array(n);
    for (let i = 0; i < n; i += 2) {
      const r = Math.sqrt(-2 * Math.log(1 - rnd())), th = 2 * Math.PI * rnd();
      out[i] = r * Math.cos(th);
      if (i + 1 < n) out[i + 1] = r * Math.sin(th);
    }
    return out;
  }

  function context(s) {
    const L = s.layers;
    const retireAge = Math.max(s.retireAge, s.age + 1);
    const horizon = L.retirement ? Math.max(100, s.lastTo + 5) : retireAge;
    const M = Math.round((horizon - s.age) * 12);
    const R = Math.round((retireAge - s.age) * 12);
    const inf = L.inflation ? s.inflation / 100 : 0;
    const retInf = L.inflation ? inf + (s.retInflExtra || 0) / 100 : 0;
    const fee = L.fees ? s.fees / 100 : 0;
    const feeM = Math.pow(1 - fee, 1 / 12);
    const infl = new Float64Array(M + 1);
    for (let m = 0; m <= M; m++) infl[m] = Math.pow(1 + inf, m / 12);
    const contrib = new Float64Array(M);
    const payout = new Float64Array(M);
    const payIndex = new Float64Array(M + 1);
    for (let m = 0; m <= M; m++) payIndex[m] = m < R ? infl[m] : infl[Math.min(R, M)] * Math.pow(1 + retInf, (m - R) / 12);
    for (let m = 0; m < M; m++) {
      if (m < R) contrib[m] = s.monthly * Math.pow(1 + s.raise / 100, Math.floor(m / 12));
      else payout[m] = s.payout * payIndex[m];
    }
    return {
      s, M, R, horizon, retireAge, infl, contrib, payout, payIndex,
      initial: s.initial,
      gAcc: Math.pow(1 + s.ret / 100, 1 / 12) * feeM,
      gRet: Math.pow(1 + s.retRet / 100, 1 / 12) * feeM,
      sAcc: L.market ? s.vol / 100 / Math.sqrt(12) : 0,
      sRet: L.market ? s.retVol / 100 / Math.sqrt(12) : 0,
    };
  }

  function monthOf(ctx, age) {
    return Math.round((age - ctx.s.age) * 12);
  }

  function compile(ctx, events, opts) {
    const { M, R } = ctx;
    const owe = new Float64Array(M), sell = new Float64Array(M), crash = new Float64Array(M);
    const skip = opts && opts.skip, force = opts && opts.force;
    if (ctx.s.layers.events) {
      for (const e of events) {
        if (e.id === skip) continue;
        const m0 = monthOf(ctx, e.age);
        if (m0 < 0 || m0 >= M) continue;
        if (e.kind === 'crash') {
          const drop = Math.log(1 - Math.min(e.drop, 95) / 100);
          crash[m0] += drop;
          const n = Math.round(e.recovery * 12);
          for (let k = 1; k <= n && m0 + k < M; k++) crash[m0 + k] -= drop / n;
          continue;
        }
        const mode = force && force.id === e.id ? force.mode : e.mode;
        const amount = e.cost * ctx.infl[m0];
        if (mode === 'pause' && m0 < R) owe[m0] += amount;
        else sell[m0] += amount;
      }
    }
    return { owe, sell, crash };
  }

  function run(ctx, ev, z, zOff, out, deposits) {
    const { M, R, contrib, payout, gAcc, gRet, sAcc, sRet } = ctx;
    let b = ctx.initial, owe = 0, depl = -1, dep = ctx.initial;
    out[0] = b;
    if (deposits) deposits[0] = dep;
    for (let m = 0; m < M; m++) {
      if (m === R && owe > 0) { b -= owe; owe = 0; }
      owe += ev.owe[m];
      if (m < R) {
        const c = contrib[m], use = c < owe ? c : owe;
        owe -= use; b += c - use; dep += c - use;
      } else if (depl < 0) {
        if (b <= payout[m]) { b = 0; depl = m; } else b -= payout[m];
      }
      b -= ev.sell[m];
      if (m < R) dep = Math.max(0, dep - ev.sell[m]);
      if (b <= 0) { b = 0; if (m >= R && depl < 0) depl = m; }
      else {
        let lr = ev.crash[m];
        if (z) lr += (m < R ? sAcc : sRet) * z[zOff + m];
        b *= (m < R ? gAcc : gRet) * (lr === 0 ? 1 : Math.exp(lr));
      }
      out[m + 1] = b;
      if (deposits) deposits[m + 1] = m < R ? dep : NaN;
    }
    return depl;
  }

  function steady(ctx, events, opts) {
    const bal = new Float64Array(ctx.M + 1), deposits = new Float64Array(ctx.M + 1);
    const depl = run(ctx, compile(ctx, events, opts), null, 0, bal, deposits);
    return { bal, deposits, depl };
  }

  function brochure(ctx) {
    const s = ctx.s, g = Math.pow(1 + s.ret / 100, 1 / 12), out = new Float64Array(ctx.M + 1);
    let b = s.initial, depl = -1;
    out[0] = b;
    for (let m = 0; m < ctx.M; m++) {
      if (m < ctx.R) b += s.monthly;
      else if (depl < 0) { if (b <= ctx.payout[m]) { b = 0; depl = m; } else b -= ctx.payout[m]; }
      b *= g;
      out[m + 1] = b;
    }
    return { bal: out, depl };
  }

  const QS = [0.1, 0.25, 0.5, 0.75, 0.9];

  function monteCarlo(ctx, events, Z, N) {
    const M = ctx.M, W = M + 1, ev = compile(ctx, events);
    const mat = new Float32Array(N * W), depl = new Int32Array(N), row = new Float64Array(W);
    for (let p = 0; p < N; p++) {
      depl[p] = run(ctx, ev, Z, p * Z_STRIDE, row);
      mat.set(row, p * W);
    }
    const bands = QS.map(() => new Float64Array(W)), col = new Float32Array(N);
    for (let m = 0; m < W; m++) {
      for (let p = 0; p < N; p++) col[p] = mat[p * W + m];
      col.sort();
      for (let k = 0; k < QS.length; k++) bands[k][m] = col[Math.round(QS[k] * (N - 1))];
    }
    const score = (p) => (depl[p] >= 0 ? depl[p] : M + Math.log1p(mat[p * W + M]));
    const ranked = Array.from({ length: N }, (_, p) => p).sort((a, b) => score(a) - score(b));
    return { mat, depl, bands, ranked, N, W };
  }

  function pathOf(mc, p) {
    return mc.mat.subarray(p * mc.W, (p + 1) * mc.W);
  }

  function sequence(ctx, Z, p, startBal) {
    const { M, R, payout, gRet, sRet } = ctx;
    const Y = Math.floor((M - R) / 12);
    if (Y < 1) return null;
    const blocks = [];
    for (let y = 0; y < Y; y++) {
      const lr = new Float64Array(12);
      let sum = 0;
      for (let k = 0; k < 12; k++) {
        lr[k] = Math.log(gRet) + sRet * Z[p * Z_STRIDE + R + y * 12 + k];
        sum += lr[k];
      }
      blocks.push({ lr, sum, ret: Math.exp(sum) - 1 });
    }
    const orders = {
      rolled: blocks.map((_, i) => i),
      worst: blocks.map((_, i) => i).sort((a, b) => blocks[a].sum - blocks[b].sum),
      best: blocks.map((_, i) => i).sort((a, b) => blocks[b].sum - blocks[a].sum),
    };
    const result = { years: Y, avg: Math.exp(blocks.reduce((a, b) => a + b.sum, 0) / Y) - 1, lines: {} };
    for (const key in orders) {
      const out = new Float64Array(Y * 12 + 1);
      let b = startBal, depl = -1;
      out[0] = b;
      orders[key].forEach((yi, j) => {
        for (let k = 0; k < 12; k++) {
          const i = j * 12 + k, m = R + i;
          if (depl < 0) {
            if (b <= payout[m]) { b = 0; depl = i; } else b = (b - payout[m]) * Math.exp(blocks[yi].lr[k]);
          }
          out[i + 1] = b;
        }
      });
      result.lines[key] = { bal: out, depl, returns: orders[key].map((yi) => blocks[yi].ret) };
    }
    return result;
  }

  const api = { Z_STRIDE, QS, normals, context, monthOf, compile, run, steady, brochure, monteCarlo, pathOf, sequence };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Engine = api;
})(typeof window !== 'undefined' ? window : globalThis);
