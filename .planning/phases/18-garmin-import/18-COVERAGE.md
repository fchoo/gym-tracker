# Phase 18 Requirement Coverage

| Requirement | Primary plan | Closure evidence |
|---|---:|---|
| GAR-01 | 18-14 | Workout, Running-plan, and Calendar-origin contextual routes; four roots unchanged |
| GAR-02 | 18-10 | Stable three-column Garmin header |
| GAR-03 | 18-06 | Disconnected, offline, unavailable, and sign-in-needed account states |
| GAR-04 | 18-02, 18-03 | Typed login/MFA plus authenticated native proof |
| GAR-05 | 18-06, 18-10 | Connected account, last successful sync, activities, dedupe status, actions |
| GAR-06 | 18-05, 18-10, 18-13 | Bounded foreground sync and 403/429/failure proof |
| GAR-07 | 18-06, 18-13 | Generation-fenced local logout with retained history |
| GAR-08 | 18-04, 18-05, 18-07 | Allowlisted JSON reads, canonical envelope, shared atomic import |
| GAR-09 | 18-04, 18-05, 18-07, 18-13 | Malformed/oversized/missing/revision/interruption recovery |
| GAR-10 | 18-08 | Outdoor factual detail and optional route/HR |
| GAR-11 | 18-08 | Treadmill No route and factual totals |
| GAR-12 | 18-08 | Accessible Lap, Time, Pace table |
| GAR-13 | 18-09 | Stable candidate query and zero-write selection |
| GAR-14 | 18-09 | Confirm-only revision-fenced match |
| GAR-15 | 18-07, 18-08, 18-10 | Loading/missing/projection/fetch error recovery |
| GAR-16 | 18-06, 18-08, 18-10, 18-14 | Shared persisted Light/Dark/System appearance |

Coverage is 16/16. Manual FIT, partner API/broker, desktop bridge, and runtime-agent work are excluded by D-18-12 and are not coverage gaps.

## Garmin client capability decisions

> Full client surface starts integrated; exclusions below are explicit owner-scope decisions.

| capability | decision | reason |
|---|---|---|
| login | INTEGRATE | Foreground owner-account authentication selected by D-18-03 |
| resume_login_mfa | INTEGRATE | Required foreground MFA continuation |
| encrypted_di_token_restore_refresh | INTEGRATE | Required standalone restart contract |
| logout_local_session | INTEGRATE | Required by GAR-07 while retaining imported history |
| get_activities_running | INTEGRATE | Required bounded paged Running discovery |
| get_activity | INTEGRATE | Required source summary read |
| get_activity_splits | INTEGRATE | Required source lap and split facts |
| get_activity_details | INTEGRATE | Required bounded route and heart-rate samples |
| upload_activity | OPT-OUT | Read-only import milestone; upload is outside D-18-04 |
| delete_remote_activity | OPT-OUT | Gym Tracker must not mutate Garmin cloud history |
| download_original_activity | OPT-OUT | D-18-12 excludes original-file decoding from this milestone |
| health_wellness_metrics | OPT-OUT | Sleep, stress, weight, body battery, and wellness are not GAR-01..16 |
| device_settings_management | OPT-OUT | App imports activity facts and does not manage Garmin devices |
| training_workouts_courses | OPT-OUT | Workout push, courses, and training-plan mutation are outside scope |
| social_challenges_badges | OPT-OUT | Personal-use app has no social/community requirement |
| arbitrary_endpoint_method_forwarding | OPT-OUT | Prohibited typed-bridge security boundary under D-18-04 |
