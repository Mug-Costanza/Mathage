// src/ml/mnist.js
import * as tf from "@tensorflow/tfjs";

let model;

// ===================== TUNABLES =====================
const BIN_THRESH = 50;            // 0..255. Higher -> fewer white pixels; increases gaps
const ERODE_ITER = 0;              // 0,1,2... Do 1 for gentle separation; 2 if still merging
const MIN_AREA_FRAC = 0.001;       // drop tiny noise blobs (~0.1% of canvas)
const MIN_DIGIT_WIDTH_FRAC = 0.04; // min width of a digit (relative to canvas width)
const VALLEY_THRESH = 2;           // columns with <= this many white pixels become split points
const MIN_SUBWIDTH_FRAC = 0.06;    // min width of each sub-blob after valley split

// minus detection
const MINUS_MIN_WIDTH_FRAC = 0.08; // ≥ 8% of canvas width
const MINUS_MAX_THINNESS = 0.35;   // (h / w) ≤ 0.35
const MINUS_LEFT_MARGIN_FRAC = 0.02; // minus must end at least this far left of the first digit
// ====================================================

export async function loadMNISTModel() {
  if (!model) {
    model = await tf.loadLayersModel("/mnist_model/model.json");
  }
  return model;
}

// ---------- low-level utils ----------
function toBinaryUint8(imageData) {
  const { data, width, height } = imageData;
  const out = new Uint8Array(width * height); // 0 or 1
  for (let i = 0, p = 0; i < data.length; i += 4, p++) {
    const r = data[i], g = data[i + 1], b = data[i + 2];
    const Y = 0.299 * r + 0.587 * g + 0.114 * b;
    out[p] = Y > BIN_THRESH ? 1 : 0; // white ink on black bg
  }
  return out;
}

// 3x3 binary erosion, 4-neighborhood core with corners to make it a bit stricter
function erode(binary, W, H, iters = 1) {
  let src = binary, dst = new Uint8Array(W * H);
  const idx = (x, y) => y * W + x;
  for (let k = 0; k < iters; k++) {
    dst.fill(0);
    for (let y = 1; y < H - 1; y++) {
      for (let x = 1; x < W - 1; x++) {
        // keep white (1) only if all 3x3 neighbors are white
        let keep = 1;
        for (let yy = -1; yy <= 1 && keep; yy++) {
          for (let xx = -1; xx <= 1; xx++) {
            if (src[idx(x + xx, y + yy)] === 0) { keep = 0; break; }
          }
        }
        dst[idx(x, y)] = keep;
      }
    }
    // swap
    if (k < iters - 1) {
      const tmp = src; src = dst; dst = tmp;
    } else {
      src = dst;
    }
  }
  return src;
}

// 4-connected components
function labelComponents(binary, W, H) {
  const labels = new Int32Array(W * H).fill(-1);
  const components = [];
  let next = 0;

  const qx = new Int32Array(W * H);
  const qy = new Int32Array(W * H);

  const push = (x, y, qt) => { qx[qt.tail] = x; qy[qt.tail] = y; qt.tail++; };

  for (let y0 = 0; y0 < H; y0++) {
    for (let x0 = 0; x0 < W; x0++) {
      const i0 = y0 * W + x0;
      if (binary[i0] === 0 || labels[i0] !== -1) continue;

      let qt = { head: 0, tail: 0 };
      push(x0, y0, qt);

      let minx = x0, maxx = x0, miny = y0, maxy = y0, area = 0;

      while (qt.head < qt.tail) {
        const x = qx[qt.head];
        const y = qy[qt.head];
        qt.head++;
        const i = y * W + x;
        if (labels[i] !== -1) continue;
        labels[i] = next;
        area++;

        if (x < minx) minx = x; if (x > maxx) maxx = x;
        if (y < miny) miny = y; if (y > maxy) maxy = y;

        // 4-neighbors
        if (x > 0)   { const j = y * W + (x - 1); if (binary[j] && labels[j] === -1) push(x - 1, y, qt); }
        if (x + 1 < W) { const j = y * W + (x + 1); if (binary[j] && labels[j] === -1) push(x + 1, y, qt); }
        if (y > 0)   { const j = (y - 1) * W + x; if (binary[j] && labels[j] === -1) push(x, y - 1, qt); }
        if (y + 1 < H) { const j = (y + 1) * W + x; if (binary[j] && labels[j] === -1) push(x, y + 1, qt); }
      }

      components.push({ x: minx, y: miny, w: maxx - minx + 1, h: maxy - miny + 1, area });
      next++;
    }
  }
  return components;
}

// optional intra-component valley split (handles very close digits with a tiny gap)
function splitWideComponentByValley(binary, W, H, comp) {
  const { x, y, w, h } = comp;
  // column sums inside bbox
  const sums = new Array(w).fill(0);
  for (let cx = 0; cx < w; cx++) {
    let s = 0;
    for (let cy = 0; cy < h; cy++) {
      s += binary[(y + cy) * W + (x + cx)];
    }
    sums[cx] = s;
  }
  // find runs of columns that are "on" separated by valleys (<= VALLEY_THRESH)
  const on = (v) => v > VALLEY_THRESH;
  const parts = [];
  let st = -1;
  for (let cx = 0; cx < w; cx++) {
    if (on(sums[cx])) {
      if (st === -1) st = cx;
    } else if (st !== -1) {
      parts.push([st, cx - 1]);
      st = -1;
    }
  }
  if (st !== -1) parts.push([st, w - 1]);

  if (parts.length <= 1) return [comp]; // nothing to split

  // Keep only reasonably wide parts
  const minSub = Math.max(8, Math.floor(MIN_SUBWIDTH_FRAC * W));
  const boxes = parts
    .filter(([a, b]) => (b - a + 1) >= minSub)
    .map(([a, b]) => ({ x: x + a, y, w: b - a + 1, h }));

  return boxes.length ? boxes : [comp];
}

// minus sign heuristic: long, thin, left of first digit
function pickMinusBox(allBoxes, W) {
  if (allBoxes.length === 0) return -1;

  // FIX: Find the first *digit-like* box, not just any box
  const digitCandidates = allBoxes.filter(b => (b.w / b.h) < 1.5 && (b.h / b.w) < 1.5);
  if (digitCandidates.length === 0) return -1;
  const firstDigit = [...digitCandidates].sort((a, b) => a.x - b.x)[0];
  
  const leftMargin = Math.max(4, Math.floor(MINUS_LEFT_MARGIN_FRAC * W));
  
  let best = -1, bestScore = -1e15;
  for (let i = 0; i < allBoxes.length; i++) {
    const b = allBoxes[i];
    
    // Skip the first digit itself
    if (b === firstDigit) continue;

    const thin = (b.h / Math.max(1, b.w)) <= MINUS_MAX_THINNESS;
    const long = b.w >= Math.floor(MINUS_MIN_WIDTH_FRAC * W);
    const left = (b.x + b.w) <= (firstDigit.x - leftMargin);
    
    if (thin && long && left) {
      const score = b.w - 2 * b.h; // prefer longer/thinner
      if (score > bestScore) { bestScore = score; best = i; }
    }
  }
  return best;
}

function classifyCrop28x28(srcCanvas, box, tmp28, ctx28, mdl) {
  const crop = document.createElement("canvas");
  crop.width = box.w; crop.height = box.h;
  crop.getContext("2d").drawImage(
    srcCanvas, box.x, box.y, box.w, box.h,
    0, 0, box.w, box.h
  );

  // letterbox to 28x28
  ctx28.fillStyle = "black";
  ctx28.fillRect(0, 0, 28, 28);
  const scale = Math.min(28 / box.w, 28 / box.h);
  const dw = Math.max(1, Math.round(box.w * scale));
  const dh = Math.max(1, Math.round(box.h * scale));
  const dx = Math.floor((28 - dw) / 2);
  const dy = Math.floor((28 - dh) / 2);
  ctx28.drawImage(crop, 0, 0, box.w, box.h, dx, dy, dw, dh);

  const t = tf.tidy(() => tf.browser.fromPixels(tmp28, 1).toFloat().div(255).expandDims(0));
  const logits = mdl.predict(t);
  const digit = logits.argMax(1).dataSync()[0];
  tf.dispose([t, logits]);
  return digit;
}

// ---------- PUBLIC: multi-digit with minus ----------
export async function predictDigitsFromDataURL(dataURL, model) {
  // draw to offscreen
  const img = await new Promise((res) => {
    const im = new Image();
    im.onload = () => res(im);
    im.src = dataURL;
  });
  const W = img.width, H = img.height;
  const can = document.createElement("canvas");
  can.width = W; can.height = H;
  const ctx = can.getContext("2d");
  ctx.drawImage(img, 0, 0);

  // binarize + optional erosion to increase gaps
  const imageData = ctx.getImageData(0, 0, W, H);
  let bin = toBinaryUint8(imageData);
  if (ERODE_ITER > 0) bin = erode(bin, W, H, ERODE_ITER);

  // components
  const compsAll = labelComponents(bin, W, H);
  const minArea = Math.max(30, Math.floor(W * H * MIN_AREA_FRAC));
  let boxes = compsAll
    .filter(c => c.area >= minArea)
    .map(c => ({ x: c.x, y: c.y, w: c.w, h: c.h }));

  if (!boxes.length) {
    // fallback: single-digit prediction
    const single = await predictDigitFromDataURL(dataURL, model);
    return String(single);
  }

  // === FIX: Minus detection must happen BEFORE component splitting ===
  const minusIdx = pickMinusBox(boxes, W);
  const isNegative = minusIdx !== -1;
  if (isNegative) {
    boxes = boxes.filter((_, i) => i !== minusIdx);
  }
  // === END FIX ===

  // split wide boxes by valley to catch very close digits
  const minDigitW = Math.max(8, Math.floor(MIN_DIGIT_WIDTH_FRAC * W));
  const splitBoxes = [];
  for (const b of boxes) {
    const isWide = b.w >= Math.max(minDigitW * 2, Math.floor(0.15 * W));
    if (isWide) {
      const parts = splitWideComponentByValley(bin, W, H, b);
      splitBoxes.push(...parts);
    } else {
      splitBoxes.push(b);
    }
  }
  boxes = splitBoxes;

  // sort left→right and classify
  boxes.sort((a, b) => a.x - b.x);

  const tmp28 = document.createElement("canvas");
  tmp28.width = 28; tmp28.height = 28;
  const ctx28 = tmp28.getContext("2d");

  const digits = [];
  for (const b of boxes) {
    const d = classifyCrop28x28(can, b, tmp28, ctx28, model);
    digits.push(String(d));
  }
  return (isNegative ? "-" : "") + digits.join("");
}

// ---------- keep single-digit helper ----------
export async function predictDigitFromDataURL(dataURL, model) {
  const img = new Image();
  img.src = dataURL;
  await new Promise((res) => (img.onload = res));
  const t = tf.tidy(() =>
    tf.browser.fromPixels(img, 1)
      .resizeNearestNeighbor([28, 28])
      .toFloat()
      .div(255)
      .expandDims(0)
  );
  const logits = model.predict(t);
  const digit = logits.argMax(1).dataSync()[0];
  tf.dispose([t, logits]);
  return digit;
}
