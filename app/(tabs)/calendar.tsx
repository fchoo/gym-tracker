import {
  router,
  type Href,
} from "expo-router";

import {
  useWorkoutAppRuntime,
} from "../../src/bootstrap/workoutAppRuntime";
import {
  CalendarScreen,
} from "../../src/ui/screens/CalendarScreen";

export default function CalendarRoute() {
  const runtime = useWorkoutAppRuntime();
  const now = new Date();
  const initialDate = [
    now.getFullYear().toString().padStart(4, "0"),
    (now.getMonth() + 1).toString().padStart(2, "0"),
    now.getDate().toString().padStart(2, "0"),
  ].join("-");

  return (
    <CalendarScreen
      initialDate={initialDate}
      loadCalendarMonth={({ month, selectedDate }) => runtime.loadCalendarMonth({
        month,
        selectedDate,
        today: initialDate,
      })}
      onOpenSession={(sessionId) =>
        router.push(("/session/" + sessionId) as Href)}
      today={initialDate}
    />
  );
}
