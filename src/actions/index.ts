import type { ActionAPIContext } from "astro:actions";
import { defineAction, ActionError } from "astro:actions";
import { z } from "astro:schema";
import { db, eq, and, TimerPresets, FocusSessions, FocusIntervals } from "astro:db";

function requireUser(context: ActionAPIContext) {
  const locals = context.locals as App.Locals | undefined;
  const user = locals?.user;

  if (!user) {
    throw new ActionError({
      code: "UNAUTHORIZED",
      message: "You must be signed in to perform this action.",
    });
  }

  return user;
}

export const server = {
  createPreset: defineAction({
    input: z.object({
      name: z.string().min(1, "Name is required"),
      focusMinutes: z.number().int().positive().optional(),
      shortBreakMinutes: z.number().int().positive().optional(),
      longBreakMinutes: z.number().int().positive().optional(),
      cyclesBeforeLongBreak: z.number().int().positive().optional(),
      cyclesPerBlock: z.number().int().positive().optional(),
      isDefault: z.boolean().optional(),
    }),
    handler: async (input, context) => {
      const user = requireUser(context);

      if (input.isDefault) {
        await db
          .update(TimerPresets)
          .set({ isDefault: false, updatedAt: new Date() })
          .where(eq(TimerPresets.ownerId, user.id));
      }

      const [preset] = await db
        .insert(TimerPresets)
        .values({
          ownerId: user.id,
          name: input.name,
          focusMinutes: input.focusMinutes ?? 25,
          shortBreakMinutes: input.shortBreakMinutes ?? 5,
          longBreakMinutes: input.longBreakMinutes,
          cyclesBeforeLongBreak: input.cyclesBeforeLongBreak,
          cyclesPerBlock: input.cyclesPerBlock,
          isDefault: input.isDefault ?? false,
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .returning();

      return { preset };
    },
  }),

  updatePreset: defineAction({
    input: z.object({
      id: z.number().int(),
      name: z.string().min(1).optional(),
      focusMinutes: z.number().int().positive().optional(),
      shortBreakMinutes: z.number().int().positive().optional(),
      longBreakMinutes: z.number().int().positive().optional(),
      cyclesBeforeLongBreak: z.number().int().positive().optional(),
      cyclesPerBlock: z.number().int().positive().optional(),
      isDefault: z.boolean().optional(),
    }),
    handler: async (input, context) => {
      const user = requireUser(context);
      const { id, ...rest } = input;

      const [existing] = await db
        .select()
        .from(TimerPresets)
        .where(and(eq(TimerPresets.id, id), eq(TimerPresets.ownerId, user.id)))
        .limit(1);

      if (!existing) {
        throw new ActionError({
          code: "NOT_FOUND",
          message: "Preset not found.",
        });
      }

      if (rest.isDefault) {
        await db
          .update(TimerPresets)
          .set({ isDefault: false, updatedAt: new Date() })
          .where(and(eq(TimerPresets.ownerId, user.id), eq(TimerPresets.isDefault, true)));
      }

      const updateData: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(rest)) {
        if (typeof value !== "undefined") {
          updateData[key] = value;
        }
      }

      if (Object.keys(updateData).length === 0) {
        return { preset: existing };
      }

      const [preset] = await db
        .update(TimerPresets)
        .set({
          ...updateData,
          updatedAt: new Date(),
        })
        .where(and(eq(TimerPresets.id, id), eq(TimerPresets.ownerId, user.id)))
        .returning();

      return { preset };
    },
  }),

  listPresets: defineAction({
    input: z.object({}).optional(),
    handler: async (_, context) => {
      const user = requireUser(context);

      const presets = await db
        .select()
        .from(TimerPresets)
        .where(eq(TimerPresets.ownerId, user.id));

      return { presets };
    },
  }),

  startSession: defineAction({
    input: z.object({
      presetId: z.number().int().optional(),
      label: z.string().optional(),
      plannedFocusMinutes: z.number().int().positive().optional(),
      plannedCycles: z.number().int().positive().optional(),
      meta: z.any().optional(),
    }),
    handler: async (input, context) => {
      const user = requireUser(context);

      if (input.presetId) {
        const [preset] = await db
          .select()
          .from(TimerPresets)
          .where(and(eq(TimerPresets.id, input.presetId), eq(TimerPresets.ownerId, user.id)))
          .limit(1);

        if (!preset) {
          throw new ActionError({
            code: "NOT_FOUND",
            message: "Preset not found.",
          });
        }
      }

      const [session] = await db
        .insert(FocusSessions)
        .values({
          userId: user.id,
          presetId: input.presetId,
          label: input.label,
          plannedFocusMinutes: input.plannedFocusMinutes,
          plannedCycles: input.plannedCycles,
          status: "in_progress",
          startedAt: new Date(),
          meta: input.meta,
        })
        .returning();

      return { session };
    },
  }),

  completeSession: defineAction({
    input: z.object({
      id: z.number().int(),
      actualFocusMinutes: z.number().int().nonnegative().optional(),
      actualBreakMinutes: z.number().int().nonnegative().optional(),
      completedCycles: z.number().int().nonnegative().optional(),
      status: z.enum(["in_progress", "completed", "cancelled"]).optional(),
      meta: z.any().optional(),
    }),
    handler: async (input, context) => {
      const user = requireUser(context);

      const [session] = await db
        .select()
        .from(FocusSessions)
        .where(and(eq(FocusSessions.id, input.id), eq(FocusSessions.userId, user.id)))
        .limit(1);

      if (!session) {
        throw new ActionError({
          code: "NOT_FOUND",
          message: "Session not found.",
        });
      }

      const [updated] = await db
        .update(FocusSessions)
        .set({
          actualFocusMinutes: input.actualFocusMinutes ?? session.actualFocusMinutes,
          actualBreakMinutes: input.actualBreakMinutes ?? session.actualBreakMinutes,
          completedCycles: input.completedCycles ?? session.completedCycles,
          status: input.status ?? "completed",
          endedAt: new Date(),
          meta: input.meta ?? session.meta,
        })
        .where(eq(FocusSessions.id, input.id))
        .returning();

      return { session: updated };
    },
  }),

  addInterval: defineAction({
    input: z.object({
      sessionId: z.number().int(),
      type: z.enum(["focus", "break", "long_break"]).optional(),
      startedAt: z.coerce.date().optional(),
      endedAt: z.coerce.date().optional(),
      durationSeconds: z.number().int().nonnegative().optional(),
      completed: z.boolean().optional(),
    }),
    handler: async (input, context) => {
      const user = requireUser(context);

      const [session] = await db
        .select()
        .from(FocusSessions)
        .where(and(eq(FocusSessions.id, input.sessionId), eq(FocusSessions.userId, user.id)))
        .limit(1);

      if (!session) {
        throw new ActionError({
          code: "NOT_FOUND",
          message: "Session not found.",
        });
      }

      const [interval] = await db
        .insert(FocusIntervals)
        .values({
          sessionId: input.sessionId,
          type: input.type ?? "focus",
          startedAt: input.startedAt ?? new Date(),
          endedAt: input.endedAt,
          durationSeconds: input.durationSeconds ?? 0,
          completed: input.completed ?? false,
        })
        .returning();

      return { interval };
    },
  }),

  listIntervals: defineAction({
    input: z.object({
      sessionId: z.number().int(),
    }),
    handler: async (input, context) => {
      const user = requireUser(context);

      const [session] = await db
        .select()
        .from(FocusSessions)
        .where(and(eq(FocusSessions.id, input.sessionId), eq(FocusSessions.userId, user.id)))
        .limit(1);

      if (!session) {
        throw new ActionError({
          code: "NOT_FOUND",
          message: "Session not found.",
        });
      }

      const intervals = await db
        .select()
        .from(FocusIntervals)
        .where(eq(FocusIntervals.sessionId, input.sessionId));

      return { intervals };
    },
  }),
};
