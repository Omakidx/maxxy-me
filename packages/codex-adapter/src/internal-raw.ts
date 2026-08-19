import { z } from "zod";

const rawRecord = z.record(z.string(), z.unknown()).default({});

export const rawCodexEventSchema = z
  .object({
    type: z.string().min(1),
    request_id: z.string().optional(),
    thread_id: z.string().optional(),
    turn_id: z.string().optional(),
    message_id: z.string().optional(),
    command_id: z.string().optional(),
    file_id: z.string().optional(),
    approval_id: z.string().optional(),
    approval_type: z.string().optional(),
    status: z.string().optional(),
    delta: z.string().optional(),
    content: z.string().optional(),
    command: z.string().optional(),
    cwd: z.string().optional(),
    output: z.string().optional(),
    exit_code: z.number().int().optional(),
    path: z.string().optional(),
    error: z.string().optional(),
    decision: z.string().optional(),
    reset_at: z.string().optional(),
    remaining_percent: z.number().int().min(0).max(100).optional(),
    payload: rawRecord,
  })
  .passthrough();

export const rawCodexRequestSchema = z.object({
  id: z.string().min(1),
  type: z.enum([
    "runtime.start",
    "thread.create",
    "thread.resume",
    "turn.start",
    "turn.steer",
    "turn.interrupt",
    "approval.resolve",
    "runtime.shutdown",
  ]),
  payload: rawRecord,
});

export type RawCodexEvent = z.infer<typeof rawCodexEventSchema>;
export type RawCodexRequest = z.infer<typeof rawCodexRequestSchema>;
