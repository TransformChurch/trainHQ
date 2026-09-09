---
name: Growth Tracks design
description: Architecture of the Growth Tracks feature (tables, progression logic, hooks)
---

## DB Tables (lib/db/src/schema/growthTracks.ts)
- `growth_tracks` — id, name, description, imageUrl, createdBy, createdAt
- `growth_track_steps` — id, growthTrackId, moduleId, stepOrder
- `growth_track_enrollments` — id, growthTrackId, userId, enrolledBy, currentStepOrder, status (active/completed), startedAt, completedAt
- `enrollment_status` pgEnum: "active" | "completed"

## Progression Logic (api-server/src/lib/growthTrackProgression.ts)
`checkGrowthTrackProgression(userId, moduleId)` — called fire-and-forget after module completion events.

Module completion is determined by:
- Has quiz → quiz result must have `passed = true`
- No quiz → all videos in module must have `watch_history.completed = true`
- No videos → considered complete

When a step is complete:
- If next stepOrder exists → insert assignment for next module, advance `currentStepOrder`
- If no next step → set enrollment status to "completed"

## Trigger Points
- `artifacts/api-server/src/routes/modules.ts` → after quiz passed (`void checkGrowthTrackProgression(dbUser.id, moduleId)`)
- `artifacts/api-server/src/routes/watchHistory.ts` → after video marked completed (`void checkGrowthTrackProgression(dbUser.id, videos[0].moduleId)`)

## API Routes (/api/growth-tracks, requireManagerOrAdmin)
- GET / — list with stepCount + enrollmentCount
- POST / — create
- PATCH /:id — update
- DELETE /:id — delete
- GET /:id/steps — ordered steps with module + trackName
- POST /:id/steps — add step (appends if no stepOrder given)
- DELETE /:id/steps/:stepId — remove step
- PATCH /:id/steps/reorder — bulk reorder [{id, stepOrder}]
- GET /:id/enrollments — enrollments with user info + progress
- POST /:id/enroll — { userIds?, groupIds? } → expands groups to members, skips already-enrolled
- DELETE /enrollments/:enrollmentId — unenroll

## Frontend
- Page: `artifacts/transform-church/src/pages/AdminGrowthTracks.tsx`
- Route: `/admin/growth-tracks` (managerOrAdmin)
- Sidebar entry: "Growth Tracks" with TrendingUp icon
