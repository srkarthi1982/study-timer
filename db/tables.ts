import { column, defineTable, NOW } from "astro:db";

/**
 * Timer presets for Pomodoro-style focus.
 * Example: "25 / 5 Classic", "50-min Deep Work", etc.
 */
export const TimerPresets = defineTable({
  columns: {
    id: column.number({ primaryKey: true, autoIncrement: true }),

    ownerId: column.text(), // parent Users.id

    name: column.text(),

    // Durations in minutes
    focusMinutes: column.number({ default: 25 }),
    shortBreakMinutes: column.number({ default: 5 }),
    longBreakMinutes: column.number({ optional: true }),

    // After how many focus sessions do we trigger a long break?
    cyclesBeforeLongBreak: column.number({ optional: true }),

    // How many focus sessions per block (optional UI hint)
    cyclesPerBlock: column.number({ optional: true }),

    isDefault: column.boolean({ default: false }),

    createdAt: column.date({ default: NOW }),
    updatedAt: column.date({ default: NOW }),
  },
});

/**
 * A full focus session the user starts.
 * Example: "Evening Deep Work", "Math Revision – Pomodoro run".
 */
export const FocusSessions = defineTable({
  columns: {
    id: column.number({ primaryKey: true, autoIncrement: true }),

    userId: column.text(), // who did the session
    presetId: column.number({
      references: () => TimerPresets.columns.id,
      optional: true,
    }),

    // Optional label for the session
    label: column.text({ optional: true }),

    // Planned vs actual stats
    plannedFocusMinutes: column.number({ optional: true }),
    actualFocusMinutes: column.number({ default: 0 }),
    actualBreakMinutes: column.number({ default: 0 }),

    plannedCycles: column.number({ optional: true }),
    completedCycles: column.number({ default: 0 }),

    status: column.text({
      enum: ["in_progress", "completed", "cancelled"],
      default: "in_progress",
    }),

    startedAt: column.date({ default: NOW }),
    endedAt: column.date({ optional: true }),

    // Extra info (e.g. tags, linked study plan/task id, etc.)
    meta: column.json({ optional: true }),
  },
});

/**
 * Individual focus/break intervals inside a session.
 * Example: Focus 25 min, Break 5 min, etc.
 */
export const FocusIntervals = defineTable({
  columns: {
    id: column.number({ primaryKey: true, autoIncrement: true }),

    sessionId: column.number({ references: () => FocusSessions.columns.id }),

    // "focus", "break", or "long_break"
    type: column.text({
      enum: ["focus", "break", "long_break"],
      default: "focus",
    }),

    startedAt: column.date({ default: NOW }),
    endedAt: column.date({ optional: true }),

    // Duration in seconds (actual)
    durationSeconds: column.number({ default: 0 }),

    completed: column.boolean({ default: false }),
  },
});

export const studyTimerTables = {
  TimerPresets,
  FocusSessions,
  FocusIntervals,
} as const;
