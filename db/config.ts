import { defineDb } from "astro:db";
import {
  TimerPresets,
  FocusSessions,
  FocusIntervals,
} from "./tables";

export default defineDb({
  tables: {
    TimerPresets,
    FocusSessions,
    FocusIntervals,
  },
});
