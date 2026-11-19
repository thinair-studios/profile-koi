// Puts git-koi's koi in a little animated pixel-art pond that reacts to Rijad's GitHub activity, and writes
// koi/koi-pond.gif with the koi's own frames, timing and loop.
//   the pond   an oval cut to the koi's path (it swims a loop that never leaves a 236px circle around the centre)
//   ripples    one for each contribution yesterday (up to 6): rings that spread across the open water and fade
//   lily pads  an island in the middle, which the koi circles: one more pad per 5 active days in the last 30 (1 to 7)
//   flowers    open on the pads while a streak lasts: one per 3 days in a row
// Everything moves on the koi's 120-frame loop, so the GIF loops seamlessly.
// Usage: GH_TOKEN=… node pond.mjs koi/koi.gif koi/koi-pond.gif RijadRajkic
import sharp from "sharp";

const [input = "koi/koi.gif", output = "koi/koi-pond.gif", login = "RijadRajkic"] = process.argv.slice(2);
const G = 256, S = 2, CX = 127.5, CY = 127.5;        // grid size, pixels per cell (the koi's pixel size), centre
const RX = 127, RY = 125;                            // outer edge of the stone rim, in cells
const WX = 119, WY = 116;                            // edge of the water: holds the koi's 236px loop with room to spare
const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const C = {
  outline: hex("#232830"), stoneA: hex("#6b737d"), stoneB: hex("#8a929b"), stoneC: hex("#575e67"), moss: hex("#4c7a52"),
  shallow: hex("#1f6a74"), mid: hex("#175661"), deep: hex("#103f4a"), glint: hex("#3c9aa6"),
  ripple: hex("#4aa5b1"), rippleSoft: hex("#2a7f8b"),
  pad: hex("#3f8f4f"), padDark: hex("#2c6a39"), padLight: hex("#5aae66"), petal: hex("#f4a7c6"), petalDark: hex("#e06d9c"), heart: hex("#f6d35b"),
};

// ---- the day's activity (the same public counts git-koi draws from; private work counts when the profile shows it)
async function activity() {
  const token = process.env.GH_TOKEN || process.env.GITHUB_TOKEN;
  if (!token) { console.warn("No GH_TOKEN: drawing a quiet pond."); return { yesterday: 0, active30: 0, streak: 0 }; }
  const query = `query($login: String!) { user(login: $login) { contributionsCollection { contributionCalendar { weeks { contributionDays { date contributionCount } } } } } }`;
  const res = await fetch("https://api.github.com/graphql", { method: "POST", headers: { Authorization: `bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({ query, variables: { login } }) });
  const body = await res.json();
  if (!res.ok || body.errors) throw new Error(`GitHub said: ${JSON.stringify(body.errors ?? body).slice(0, 300)}`);
  const days = body.data.user.contributionsCollection.contributionCalendar.weeks.flatMap((w) => w.contributionDays);
  const today = new Date().toISOString().slice(0, 10);
  const past = days.filter((d) => d.date < today);    // today isn't over yet
  let streak = 0;
  for (let i = past.length - 1; i >= 0 && past[i].contributionCount > 0; i--) streak++;
  return { yesterday: past.at(-1)?.contributionCount ?? 0, active30: past.slice(-30).filter((d) => d.contributionCount > 0).length, streak };
}
const act = await activity();
const nRipples = Math.min(6, act.yesterday);
const nPads = Math.max(1, Math.min(7, 1 + Math.floor(act.active30 / 5)));
const nFlowers = Math.min(nPads, Math.floor(act.streak / 3));
console.log(`Activity: ${act.yesterday} yesterday, ${act.active30} active days in 30, ${act.streak}-day streak → ${nRipples} ripples, ${nPads} pads, ${nFlowers} flowers.`);

// ---- the still pond: rim, water depth, a few mossy stones (seeded, so it's the same every night)
let seed = 7;
const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const e = (x, y, rx, ry) => Math.hypot((x - CX) / rx, (y - CY) / ry);   // < 1 inside that ellipse
// The rim: a ring of flat stones of mixed sizes (a few big slabs, more middling ones, small ones split into an
// inner and an outer pebble), each its own shade, lit from the top left, with a dark seam between them.
const STONES = [];
for (let at = 0; at < 1; ) {
  const r = rand(), w = r < 0.3 ? 0.011 + rand() * 0.007 : r < 0.75 ? 0.022 + rand() * 0.012 : 0.042 + rand() * 0.02;
  const pick = () => [C.stoneA, C.stoneB, C.stoneC, C.stoneA][Math.floor(rand() * 4)];
  STONES.push({ at, w, shade: pick(), inner: pick(), split: w < 0.02, moss: w > 0.04 && rand() < 0.4 });
  at += w;
}
const total = STONES.at(-1).at + STONES.at(-1).w;
for (const st of STONES) { st.at /= total; st.w /= total; }
const TURN = 2 * Math.PI * 123;                                  // cells around the rim, to keep seams one cell wide
function stone(x, y, outer, water) {
  const across = (outer - 1) / ((WX / RX) - 1);                  // 0 at the outer edge, 1 at the water
  const a = ((Math.atan2(y - CY, x - CX) / (2 * Math.PI) + 1 + Math.sin(across * 3 + x * 0.05) * 0.0015) % 1);
  const st = STONES.find((s) => a < s.at + s.w) ?? STONES.at(-1);
  const from = (a - st.at) * TURN, to = (st.at + st.w - a) * TURN;   // cells to this stone's two ends
  if (from < 0.8 || to < 0.8) return C.outline;
  if (st.split && Math.abs(across - 0.5) < 0.07) return C.outline;
  if (st.moss && across > 0.5 && from > st.w * TURN * 0.3 && to > st.w * TURN * 0.25) return C.moss;
  const lit = Math.cos(2 * Math.PI * a + Math.PI * 1.25);         // stones facing the top left catch the light
  if (from < 2.2 && lit > -0.2) return C.stoneB;                 // a lit edge on each stone
  if (to < 2 || across < 0.13) return C.stoneC;                  // the shaded side and the outer lip
  return st.split && across > 0.5 ? st.inner : st.shade;
}
const base = Array.from({ length: G }, () => Array(G).fill(null));
for (let y = 0; y < G; y++)
  for (let x = 0; x < G; x++) {
    const outer = e(x, y, RX, RY), water = e(x, y, WX, WY);
    if (outer > 1) continue;                                    // outside the pond: transparent
    if (outer > 0.988) base[y][x] = C.outline;
    else if (water > 1) base[y][x] = stone(x, y, outer, water);
    else if (water > 0.985) base[y][x] = C.outline;
    else if (water > 0.9) base[y][x] = C.shallow;
    else if (water > 0.62) base[y][x] = (x + y) % 9 === 0 && water > 0.86 ? C.shallow : C.mid;
    else base[y][x] = (x * 3 + y) % 13 === 0 && water > 0.58 ? C.mid : C.deep;
  }
const GLINTS = Array.from({ length: 60 }, () => [Math.floor(rand() * G), Math.floor(rand() * G), rand()]).filter(([x, y]) => e(x, y, WX, WY) < 0.92 && e(x, y, 44, 44) > 1);

// Seen from straight above. Spots are in cells; the first ones are the ones a quiet month shows.
// Ripples: where yesterday's contributions land, spread around the open water.
const RIPPLES = [[98, 88], [172, 142], [50, 122], [158, 70], [100, 166], [212, 118]].map(([x, y], i, all) => ({ x, y, phase: i / all.length }));
// Lily pads: an island in the middle that the koi circles, growing with the month. [x, y, radius, notch angle, drift phase]
const PADS = [[0, 0, 13, 40, 0], [-22, -10, 10, 160, 0.3], [20, 12, 11, 300, 0.6], [6, -24, 8, 220, 0.15], [-14, 20, 9, 20, 0.45], [26, -14, 7, 120, 0.8], [-28, 10, 7, 260, 0.9]]
  .map(([dx, dy, ...rest]) => [Math.round(CX + dx), Math.round(CY + dy), ...rest]);

// ---- one frame of the pond: the water under the koi, and the surface (pads, lilies) over it
function frame(t) {                                           // t: 0..1 over the loop
  const g = base.map((row) => row.slice()), top = Array.from({ length: G }, () => Array(G).fill(null));
  const put = (layer) => (x, y, c) => { x = Math.round(x); y = Math.round(y); if (x >= 0 && y >= 0 && x < G && y < G && base[y][x] && e(x, y, WX, WY) < 0.97) layer[y][x] = c; };
  const set = put(g), over = put(top);
  for (const [x, y, p] of GLINTS) if (Math.sin(2 * Math.PI * (t * 2 + p)) > 0.55) set(x, y, C.glint);
  // Ripples: round rings that spread from nothing and fade, once per loop, staggered; a second ring follows the first.
  for (const { x, y, phase } of RIPPLES.slice(0, nRipples))
    for (const lag of [0, 0.18]) {
      const k = (t + phase - lag + 2) % 1;                    // 0..1 through this ring's life
      if (k > 0.85) continue;
      const r = 1.5 + k * 16, col = k < 0.5 ? C.ripple : C.rippleSoft, steps = Math.ceil(2 * Math.PI * r * 1.6);
      for (let i = 0; i < steps; i++) {
        if (k > 0.6 && i % 3 === 0) continue;                 // breaking up as it fades
        const ang = (2 * Math.PI * i) / steps;
        set(x + r * Math.cos(ang), y + r * Math.sin(ang), col);
      }
    }
  // Lily pads drifting in small circles, with water lilies while the streak lasts.
  PADS.slice(0, nPads).forEach(([px, py, r, notch, p], i) => {
    const ang0 = 2 * Math.PI * (t + p);
    const cx = Math.round(px + Math.cos(ang0) * 1.2), cy = Math.round(py + Math.sin(ang0) * 1.2);
    for (let y = -r - 1; y <= r + 1; y++)
      for (let x = -r - 1; x <= r + 1; x++) {
        const d = Math.hypot(x, y);
        if (d > r + 0.4) continue;
        const ang = (Math.atan2(y, x) * 180) / Math.PI;
        if (Math.abs(((ang - notch + 540) % 360) - 180) > 165 && d > 1.5) continue;   // the notch cut out of each pad
        const vein = Math.abs(((ang - notch + 540) % 60) - 30) < 3 && d > 2.5 && d < r - 2;
        over(cx + x, cy + y, d > r - 1.2 ? C.padDark : vein ? C.padLight : C.pad);
      }
    if (i < nFlowers) {
      const fx = cx - Math.round(r * 0.2), fy = cy + Math.round(r * 0.2);
      for (let y = -5; y <= 5; y++)                           // a water lily: pink petals, darker at the base, gold heart
        for (let x = -5; x <= 5; x++) {
          const d = Math.hypot(x, y), petal = Math.abs(Math.sin(Math.atan2(y, x) * 4));
          if (d <= 1.5) over(fx + x, fy + y, C.heart);
          else if (d < 2.6 + petal * 2.8) over(fx + x, fy + y, d > 1.6 + petal * 2.8 ? C.petal : C.petalDark);
        }
    }
  });
  return { g, top };
}

// ---- lay each koi frame over its pond frame, keeping the koi GIF's timing
const meta = await sharp(input, { animated: true }).metadata();
const { data: koi } = await sharp(input, { animated: true }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const W = G * S, H = meta.pageHeight, pages = meta.pages;
if (meta.width !== W || H !== W) throw new Error(`Expected a ${W}×${W} koi, got ${meta.width}×${H}.`);
const out = Buffer.alloc(W * H * pages * 4);
for (let p = 0; p < pages; p++) {
  const { g, top } = frame(p / pages);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const gx = Math.floor(x / S), gy = Math.floor(y / S), k = ((p * H + y) * W + x) * 4;
      const c = g[gy][gx], a = top[gy][gx] ? 0 : koi[k + 3] / 255;   // the surface hides the koi swimming under it
      if (top[gy][gx]) { out.set([...top[gy][gx], 255], k); continue; }
      if (!c && a === 0) continue;                            // outside the pond and no koi: stays transparent
      const bg = c ?? [0, 0, 0];
      for (let ch = 0; ch < 3; ch++) out[k + ch] = Math.round(koi[k + ch] * a + bg[ch] * (1 - a));
      out[k + 3] = c ? 255 : koi[k + 3];
    }
}
await sharp(out, { raw: { width: W, height: H * pages, channels: 4, pageHeight: H } })
  .gif({ delay: meta.delay, loop: meta.loop ?? 0, effort: 7 })
  .toFile(output);
console.log(`Wrote ${output}: ${pages} frames.`);
