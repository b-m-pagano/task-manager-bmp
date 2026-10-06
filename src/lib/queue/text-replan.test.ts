import { describe, expect, it } from "vitest";
import { buildTextReplan } from "./text-replan";

const tasks = [
  { id: "a", title: "A", duration: 60, priority: "medium" as const, startMinute: 600 },
  { id: "b", title: "B", duration: 30, priority: "medium" as const, startMinute: 660 },
];

describe("buildTextReplan", () => {
  it("never overlaps calendar events", () => {
    const r = buildTextReplan(tasks, [{ start: 630, end: 720 }], { order: [], changes: [], newItems: [] }, { fromMinute: 600 });
    for (const p of r.placements) expect(p.start + p.duration <= 630 || p.start >= 720).toBe(true);
  });

  it("starts the remaining day at the current minute", () => {
    const r = buildTextReplan(tasks, [], { order: [], changes: [], newItems: [] }, { fromMinute: 700 });
    expect(r.placements[0]!.start).toBe(700);
  });

  it("follows the AI order and keeps done tasks out", () => {
    const r = buildTextReplan(tasks, [], {
      order: ["b", "a"],
      changes: [{ taskId: "a", priority: null, durationMin: null, markDone: true, moveToTomorrow: false }],
      newItems: [],
    }, { fromMinute: 600 });
    expect(r.placements.map((p) => p.id)).toEqual(["b"]);
    expect(r.done.map((d) => d.id)).toEqual(["a"]);
  });

  it("sends items that do not fit to overflow", () => {
    const r = buildTextReplan(tasks, [], { order: [], changes: [], newItems: [] }, { fromMinute: 1400, dayEnd: 1440 });
    expect(r.overflow.map((o) => o.id)).toEqual(["a"]);
  });
});
