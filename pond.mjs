// Puts git-koi's koi in a little pixel-art pond that reacts to Rijad's GitHub activity, then lays every frame of
// koi/koi.gif over it and writes koi/koi-pond.gif with the same timing and loop.
//   ripples   one ring for each contribution yesterday (up to 6): a busy day leaves a busy surface
//   lily pads one more for every 5 active days in the last 30 (1 to 7)
//   flowers   bloom on the pads while a streak lasts: one per 3 days in a row (as many as there are pads)
// Usage: GH_TOKEN=… node pond.mjs koi/koi.gif koi/koi-pond.gif RijadRajkic
// The pond is drawn on a 256 grid and doubled, so its pixels match the koi's; everything outside it stays transparent.
import sharp from "sharp";

const [input = "koi/koi.gif", output = "koi/koi-pond.gif", login = "RijadRajkic"] = process.argv.slice(2);

// The contribution calendar (the same public counts git-koi draws from; private work counts when the profile shows it).
async function activity() {
  const token = process.env.GH_TOKEN || process.env.GITHUB_TOKEN;
  if (!token) { console.warn("No GH_TOKEN: drawing a quiet pond."); return { yesterday: 0, active30: 0, streak: 0 }; }
  const query = `query($login: String!) { user(login: $login) { contributionsCollection { contributionCalendar { weeks { contributionDays { date contributionCount } } } } } }`;
  const res = await fetch("https://api.github.com/graphql", { method: "POST", headers: { Authorization: `bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({ query, variables: { login } }) });
  const body = await res.json();
  if (!res.ok || body.errors) throw new Error(`GitHub said: ${JSON.stringify(body.errors ?? body).slice(0, 300)}`);
  const days = body.data.user.contributionsCollection.contributionCalendar.weeks.flatMap((w) => w.contributionDays);
  const today = new Date().toISOString().slice(0, 10);
  const past = days.filter((d) => d.date < today);            // today isn't over yet
  const yesterday = past.at(-1)?.contributionCount ?? 0;
  const active30 = past.slice(-30).filter((d) => d.contributionCount > 0).length;
  let streak = 0;
  for (let i = past.length - 1; i >= 0 && past[i].contributionCount > 0; i--) streak++;
  return { yesterday, active30, streak };
}
const act = await activity();
const ripples = Math.min(6, act.yesterday);
const pads = Math.max(1, Math.min(7, 1 + Math.floor(act.active30 / 5)));
const flowers = Math.min(pads, Math.floor(act.streak / 3));
console.log(`Activity: ${act.yesterday} yesterday, ${act.active30} active days in 30, ${act.streak}-day streak → ${ripples} ripples, ${pads} pads, ${flowers} flowers.`);
const G = 256, S = 2;                 // grid size, and pixels per grid cell
const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const C = {
  outline: hex("#232830"), stoneA: hex("#6b737d"), stoneB: hex("#8a929b"), stoneC: hex("#575e67"),
  shallow: hex("#1f6a74"), mid: hex("#175661"), deep: hex("#103f4a"), glint: hex("#2f8c99"), ripple: hex("#2a7f8b"),
  pad: hex("#3f8f4f"), padDark: hex("#2c6a39"), padLight: hex("#5aae66"), petal: hex("#f4a7c6"), petalDark: hex("#e06d9c"), heart: hex("#f6d35b"),
};

// A seeded random, so the pond looks the same every night.
let seed = 7;
const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

const grid = Array.from({ length: G }, () => Array(G).fill(null));
const set = (x, y, c) => { if (x >= 0 && y >= 0 && x < G && y < G) grid[y][x] = c; };

// Distance from a point inside the rounded square to its edge (negative = outside).
const M = 4, R = 44;                  // margin and corner radius, in grid cells
function inset(x, y) {
  const cx = Math.min(Math.max(x, M + R), G - 1 - M - R), cy = Math.min(Math.max(y, M + R), G - 1 - M - R);
  const dx = x - cx, dy = y - cy;
  if (dx === 0 && dy === 0 || (Math.abs(x - cx) === 0 && x >= M + R && x <= G - 1 - M - R) || (Math.abs(y - cy) === 0 && y >= M + R && y <= G - 1 - M - R))
    return Math.min(x - M, G - 1 - M - x, y - M, G - 1 - M - y);
  return R - Math.hypot(dx, dy);
}

for (let y = 0; y < G; y++)
  for (let x = 0; x < G; x++) {
    const d = inset(x, y);
    if (d < 0) continue;                                  // outside the pond: transparent
    if (d < 1) set(x, y, C.outline);
    else if (d < 5) set(x, y, rand() < 0.5 ? C.stoneA : rand() < 0.6 ? C.stoneB : C.stoneC);   // the stone rim
    else if (d < 6) set(x, y, C.outline);
    else if (d < 14) set(x, y, C.shallow);
    else if (d < 30) set(x, y, (x + y) % 9 === 0 && d < 16 ? C.shallow : C.mid);
    else set(x, y, (x * 3 + y) % 13 === 0 && d < 33 ? C.mid : C.deep);
  }

// A few glints on the water and two faint ripples.
for (let i = 0; i < 70; i++) {
  const x = Math.floor(rand() * G), y = Math.floor(rand() * G);
  if (inset(x, y) > 10) { set(x, y, C.glint); if (rand() < 0.5) set(x + 1, y, C.glint); }
}
const ring = (cx, cy, rx, ry) => { for (let a = 0; a < 360; a += 3) { const t = (a * Math.PI) / 180; if (a % 60 < 40) set(Math.round(cx + rx * Math.cos(t)), Math.round(cy + ry * Math.sin(t)), C.ripple); } };
// Ripple spots, in the order they appear as yesterday gets busier.
const RIPPLES = [[70, 186, 16], [190, 64, 13], [132, 214, 11], [204, 160, 14], [58, 96, 12], [150, 40, 10]];
for (const [cx, cy, r] of RIPPLES.slice(0, ripples)) { ring(cx, cy, r, Math.round(r * 0.45)); ring(cx, cy, Math.round(r * 0.55), Math.round(r * 0.25)); }

// Lily pads in the corners, out of the koi's way, and one flower.
function pad(cx, cy, r, notch) {
  for (let y = -r; y <= r; y++)
    for (let x = -r; x <= r; x++) {
      const d = Math.hypot(x, y);
      if (d > r + 0.4) continue;
      const ang = (Math.atan2(y, x) * 180) / Math.PI;
      if (Math.abs(((ang - notch + 540) % 360) - 180) > 170 && d > 1.5) continue;   // the wedge cut out of the pad
      set(cx + x, cy + y, d > r - 1.2 ? C.padDark : (x + y) % 5 === 0 && d < r - 3 ? C.padLight : C.pad);
    }
}
// Pad spots, corners first, in the order they appear as the month gets more active: [x, y, radius, notch angle].
const PADS = [[30, 30, 13, 40], [226, 222, 14, 220], [232, 40, 9, 160], [52, 22, 8, 120], [204, 236, 7, 300], [24, 226, 10, 20], [236, 130, 8, 200]];
PADS.slice(0, pads).forEach(([x, y, r, n]) => pad(x, y, r, n));
function flower(cx, cy) {
  for (const [x, y] of [[0, -3], [3, 0], [0, 3], [-3, 0], [2, -2], [2, 2], [-2, 2], [-2, -2]]) { set(cx + x, cy + y, C.petal); set(cx + Math.sign(x) * (Math.abs(x) - 1), cy + Math.sign(y) * (Math.abs(y) - 1), C.petalDark); }
  set(cx, cy, C.heart); set(cx + 1, cy, C.heart);
}
PADS.slice(0, flowers).forEach(([x, y, r]) => flower(x + Math.round(r * 0.3), y - Math.round(r * 0.3)));

// The pond as RGBA at full size.
const W = G * S, pond = Buffer.alloc(W * W * 4);
for (let y = 0; y < W; y++)
  for (let x = 0; x < W; x++) {
    const c = grid[Math.floor(y / S)][Math.floor(x / S)];
    if (!c) continue;
    const i = (y * W + x) * 4; pond[i] = c[0]; pond[i + 1] = c[1]; pond[i + 2] = c[2]; pond[i + 3] = 255;
  }

// Lay every koi frame over the pond and keep the GIF's own timing.
const meta = await sharp(input, { animated: true }).metadata();
const { data: koi } = await sharp(input, { animated: true }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const H = meta.pageHeight, pages = meta.pages;
if (meta.width !== W || H !== W) throw new Error(`Expected a ${W}×${W} koi, got ${meta.width}×${H}.`);
const out = Buffer.alloc(W * H * pages * 4);
for (let p = 0; p < pages; p++)
  for (let i = 0; i < W * H; i++) {
    const k = (p * W * H + i) * 4, a = koi[k + 3] / 255;
    for (let ch = 0; ch < 3; ch++) out[k + ch] = Math.round(koi[k + ch] * a + pond[i * 4 + ch] * (1 - a));
    out[k + 3] = Math.max(koi[k + 3], pond[i * 4 + 3]);
  }
await sharp(out, { raw: { width: W, height: H * pages, channels: 4, pageHeight: H } })
  .gif({ delay: meta.delay, loop: meta.loop ?? 0, effort: 7 })
  .toFile(output);
console.log(`Wrote ${output}: ${pages} frames over the pond.`);
