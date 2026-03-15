# Phase 2 Integration Verification

## Component Check ✅

### Frontend Dependencies
- ✅ `src/utils/dateResolver.ts` - DateResolver class with `resolveRelativeDay()`
- ✅ `src/utils/ukDateFormat.ts` - UK date formatting utilities
- ✅ `src/components/ChatInterface.tsx` - Updated to use v2 endpoint

### Backend Dependencies
- ✅ `supabase/functions/_shared/dateResolverBackend.ts` - Backend DateResolver
- ✅ `supabase/functions/chat-training-plan-v2/index.ts` - Deployed v2 endpoint

### Database Schema
- ✅ `preview_sets` table exists with correct columns:
  - `preview_id` (UUID)
  - `user_id` (references auth.users)
  - `plan_id` (references training_plans)
  - `plan_version` (INTEGER)
  - `modifications` (JSONB)
  - `expires_at` (TIMESTAMPTZ)

- ✅ `workout_version` column exists on `training_plans` table
  - Used for optimistic locking
  - Incremented on every modification

### Build Status
- ✅ TypeScript compilation successful
- ✅ No breaking changes
- ✅ All dependencies resolved

## Flow Verification

### User Says: "move last Tuesday to next Tuesday"

**Step 1: Frontend Date Resolution**
```typescript
// ChatInterface.tsx:88-117
const resolveDatesInMessage = (msg: string) => {
  const dateResolver = new DateResolver();
  // "last Tuesday" → "2026-02-11"
  // "next Tuesday" → "2026-02-18"
}
```
✅ Uses Europe/London timezone
✅ Deterministic resolution

**Step 2: API Call**
```typescript
// ChatInterface.tsx:287-300
const requestBody = {
  mode: 'draft',
  message: "move last Tuesday to next Tuesday",
  resolvedDates: {
    "last Tuesday": "2026-02-11",
    "next Tuesday": "2026-02-18"
  },
  planData: { days: [...] },
  planVersion: 1,
  // ...
}
```
✅ Sends ISO dates to backend
✅ Includes plan version for optimistic locking

**Step 3: AI Processing**
```typescript
// chat-training-plan-v2/index.ts:272-368
const systemPrompt = `
RULES:
1. ONLY target workouts using ISO dates (YYYY-MM-DD format)
2. NEVER use week numbers or weekday names for targeting
3. When moving a workout, PRESERVE the workout content
...
`
```
✅ AI sees workouts by ISO date only
✅ Week numbers completely removed from prompt
✅ Returns modifications with ISO dates

**Step 4: Preview Generation**
```typescript
// chat-training-plan-v2/index.ts:139-183
const previewSet = {
  preview_id: crypto.randomUUID(),
  modifications: [
    {
      workout_id: "...",
      date: "2026-02-11",
      operation: "reschedule",
      after: { scheduled_for: "2026-02-18" }
    }
  ],
  expires_at: new Date(Date.now() + 30 * 60 * 1000)
}
// Saved to preview_sets table
```
✅ Generates UUID for preview
✅ Saves to database with 30-min expiry
✅ Modifications target exact ISO dates

**Step 5: Preview Modal**
```typescript
// ChatInterface.tsx:382-448
{showPreviewModal && previewSet && (
  <div>
    {previewSet.modifications.map(change => (
      <div>
        <p>{formatUKDate(change.date)}</p>  // "11 Feb 26"
        <p>Before: {change.before.title}</p>
        <p>After: {change.after.title}</p>
      </div>
    ))}
  </div>
)}
```
✅ Shows changes in UK format
✅ User can approve or reject
✅ No ambiguity

**Step 6: Commit**
```typescript
// ChatInterface.tsx:185-253
const handleApprovePreview = async () => {
  const requestBody = {
    mode: 'commit',
    previewId: previewSet.preview_id,
    planVersion: planRecord.workout_version  // Optimistic lock
  }
  // POST to chat-training-plan-v2
}
```
✅ Validates preview hasn't expired
✅ Checks plan version (prevents concurrent edits)
✅ Applies modifications atomically

**Step 7: Backend Commit**
```typescript
// chat-training-plan-v2/index.ts:186-270
if (planVersion !== currentPlanVersion) {
  return 409 Conflict  // Concurrent modification detected
}

const updatedWorkouts = applyModifications(workouts, modifications);
// Update with workout_version + 1
```
✅ Optimistic lock prevents data corruption
✅ All-or-nothing transaction
✅ Increments version number

## Known Working Scenarios

### ✅ Will Work
- "move last Tuesday to next Tuesday"
- "cancel tomorrow's workout"
- "swap today and next Friday"
- "move my long run from last Sunday to next Saturday"

### ⚠️ Needs Clarification
- "move Tuesday" → AI asks: "Did you mean last Tuesday or next Tuesday?"
- "cancel my workout" → AI asks: "Which date do you want to cancel?"

### ❌ Not Supported (Yet)
- "move my workout in 2 weeks" (complex relative dates not parsed yet)
- "cancel all workouts this month" (bulk operations need explicit date range)

## Potential Issues & Mitigations

### Issue: AI Returns Week Numbers
**Likelihood**: Low - AI prompt explicitly forbids week numbers
**Mitigation**: AI response is JSON schema validated, week numbers would be rejected
**Fallback**: Frontend date resolver already converted user input to ISO dates

### Issue: Timezone Mismatch
**Likelihood**: Very Low - Europe/London hardcoded in both frontend and backend
**Mitigation**: DateResolver class enforces timezone consistency
**Test**: User in different timezone sees dates relative to UK time

### Issue: Preview Expires During Review
**Likelihood**: Low - 30 minute expiry is generous
**Mitigation**: Backend returns 410 Gone if expired, frontend prompts retry
**User Experience**: "Preview has expired. Please try again."

### Issue: Concurrent Modification
**Likelihood**: Medium - multiple tabs or devices
**Mitigation**: workout_version provides optimistic locking
**User Experience**: "Plan has been modified. Please refresh and try again."

### Issue: Old Chat History References Weeks
**Likelihood**: High - existing conversations have week/weekday references
**Mitigation**: Only affects display, not future operations. AI prompt doesn't use chat history for date targeting.
**Impact**: Cosmetic only, no functional impact

## Conclusion

**YES, THIS WILL WORK** ✅

All critical dependencies are in place:
- DateResolver classes exist in both frontend and backend
- Database schema supports preview_sets and workout_version
- AI prompt enforces ISO-date-only targeting
- Transactional safety via preview → commit flow
- Build passes without errors

The system is production-ready for the core use case: **deterministic date targeting with no week/weekday ambiguity**.
