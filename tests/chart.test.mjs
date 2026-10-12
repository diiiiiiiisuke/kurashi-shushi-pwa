import test from "node:test";
import assert from "node:assert/strict";
import { drawOverview } from "../js/ui/chart.js";

function axisLabels(amount, mode = "both", debt = null) {
  const labels = { left: [], right: [] };
  const ctx = new Proxy({
    measureText(text) { return { width: String(text).length * 7 }; },
    fillText(text) {
      if (this.textAlign === "right") labels.left.push(text);
      if (this.textAlign === "left" && text !== "予測 →") labels.right.push(text);
    },
  }, { get(target, key) { return key in target ? target[key] : () => {}; } });
  const canvas = { clientWidth: 320, style: {}, getContext: () => ctx };
  const previous = globalThis.window;
  globalThis.window = { devicePixelRatio: 2 };
  try {
    drawOverview(canvas, { nowIndex: 0, rows: [{ income: 0, expense: amount, balance: -amount, debt }] }, ["26/10"], mode);
  } finally {
    if (previous === undefined) delete globalThis.window;
    else globalThis.window = previous;
  }
  return labels;
}

test("小額の支出でも縦軸がすべて0にならない", () => {
  assert.deepEqual(axisLabels(500).left, ["0", "300", "600"]);
  assert.deepEqual(axisLabels(1).left, ["0", "1", "2"]);
});

test("大きな金額の目盛りも省略せず3桁区切りで表示する", () => {
  assert.deepEqual(axisLabels(5000).left, ["0", "3,000", "6,000"]);
  assert.deepEqual(axisLabels(50000).left, ["0", "30,000", "60,000"]);
});

test("赤字の負数と小額の残債も目盛りに表示する", () => {
  const labels = axisLabels(500, "net", 500);
  assert.deepEqual(labels.left, ["-600", "-300", "0"]);
  assert.deepEqual(labels.right, ["0", "300", "600"]);
});

test("百万以上の残債と負数も3桁区切りで表示する", () => {
  const labels = axisLabels(5000, "net", 5000000);
  assert.deepEqual(labels.left, ["-6,000", "-3,000", "0"]);
  assert.deepEqual(labels.right, ["0", "3,000,000", "6,000,000"]);
});
