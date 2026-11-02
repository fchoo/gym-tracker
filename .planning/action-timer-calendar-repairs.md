# Action buttons, rest timer and Calendar focus

The owner wants action labels on one line, related two/three actions on the same row, a balanced Add exercise/Complete Set dock, prompt rest controls, exactly two short countdown beeps followed by a long final cue, and reliable Calendar detail collapse/date selection.

Action-row review uses equal bounded cells with compact visible captions or intuitive intent glyphs where text does not fit. Full accessibility labels, minimum touch targets, theme typography and app text scaling remain. Choice lists stay vertical where they represent separate options rather than a cancel/save pair.

Rest changes are acknowledged only after their exclusive transaction commits. The authoritative RestCommandResult updates the timer immediately; unrelated Today/schedule/backup/notification reads must not delay the command result. Commands queue with current committed session/rest revisions. Notification reconciliation remains serialized and recoverable without a full workout reload for each tap.

Foreground countdown cues are short at 2 and 1 seconds, then long at the natural deadline. A delayed display tick must still emit the final cue. Manual adjustment, skip, pause, background changes and disabled preferences cancel pending cues. Foreground countdown sound ownership prevents a second notification sound while retaining durable expiry/vibration and background alerts.

Calendar's following-week overlay can extend beyond the month grid. Use the measured selected track to derive the following overlay when it has no grid measurement. Completion callback identity must not restart week settling; internal height changes must not invalidate a running transition.

Only new/source-affected checks run. Previously passed Calendar swipes, timezone cases, broad acceptance and unrelated app tests stay passed. After integration, build one signed update and preserve the phone's data. Verify affected button rows, timer adjustment/final sound, and Calendar expand/collapse/date selection under exclusive device ownership.

Ownership: action_button_rows owns action primitives and app button layouts; rest_command_latency owns runtime acknowledgement/reconciliation; rest_countdown_audio owns RestDock and audio adapters; root owns queued ActiveWorkoutScreen command integration, Calendar transition repair and all device/build work.
