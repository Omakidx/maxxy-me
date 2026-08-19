import { describe, expect, test } from "bun:test";
import { canTransitionTask, terminalTaskStatuses } from "./statuses";

describe("task state transitions", () => {
  test("allows the planned happy-path transitions", () => {
    expect(canTransitionTask("draft", "planning")).toBe(true);
    expect(canTransitionTask("queued", "ready")).toBe(true);
    expect(canTransitionTask("running", "validating")).toBe(true);
    expect(canTransitionTask("awaiting_review", "merged")).toBe(true);
  });

  test("rejects invalid skips and terminal movement", () => {
    expect(canTransitionTask("draft", "running")).toBe(false);
    expect(canTransitionTask("merged", "queued")).toBe(false);
    expect(canTransitionTask("cancelled", "running")).toBe(false);
    expect(terminalTaskStatuses).toEqual(["merged", "failed", "cancelled"]);
  });
});
