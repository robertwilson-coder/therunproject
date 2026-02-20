# Responsive/Static Plan Type Audit

## Executive Summary

The concept of "responsive" vs "static" plans is **partially deprecated** in this codebase. The actual behavior is:
- **All new plans are effectively "responsive"** - they all support chat, modifications, and adaptive features
- **The UI still has legacy responsive/static gates** - but these are mostly cosmetic
- **Database stores plan_type** - with values like 'responsive', 'date_based_preview', 'date_based_full', 'weeks_based'
- **No actual functional difference** between "responsive" and "static" in current implementation

## Classification of All References

### TYPE DEFINITIONS (Legacy Data Schema)

**Location:** `src/types/index.ts:112`
```typescript
plan_type: 'static' | 'responsive' | 'weeks_based' | 'date_based_preview' | 'date_based_full';
```
**Classification:** **Legacy data schema** - maintained for backward compatibility with existing database records
**Keep:** YES - required for TypeScript type safety and database compatibility
**Behavior Impact:** None - purely for type checking

---

### DATABASE SCHEMA (Legacy Data Storage)

**Location:** `supabase/migrations/20251002071803_update_training_plans_for_plan_types.sql`
- Adds `plan_type` column with check constraint: `('static', 'responsive')`

**Location:** `supabase/migrations/20260121163054_update_two_stage_plan_generation.sql`
- Updates constraint to: `('static', 'responsive', 'weeks_based', 'date_based_preview', 'date_based_full')`

**Classification:** **Legacy data schema** - stores historical plan type values
**Keep:** YES - existing plans in database use these values
**Behavior Impact:** None - only used for data retrieval

---

### PLAN GENERATION (Sets Type to 'responsive')

**Location:** `src/hooks/usePlanManagement.ts:72`
```typescript
setPlanType('responsive');
```
**Context:** Called in `generatePlan()` when user creates a new plan
**Classification:** **Active behavior** - ALL new plans are set to 'responsive' type
**Keep:** YES - but could be renamed to 'adaptive' or 'default' for clarity
**Behavior Impact:** **Determines saved plan type in database**

---

### UI DISPLAY - CHAT AVAILABILITY

**Location:** `src/components/PlanWithChat.tsx:169`
```typescript
{isChatOpen && (planType === 'responsive' || planType === 'date_based_preview' ||
  planType === 'date_based_full' || (planType === 'static' && isPreviewMode)) && (
```

**Classification:** **Legacy UI gate** - determines if chat interface is shown
**Current Behavior:**
- Shows chat for: responsive, date_based_preview, date_based_full, OR static in preview mode
- Effectively: shows chat for almost all plans
**Keep:** YES - but simplify condition
**Behavior Impact:** **Minor** - only affects when chat is shown (nearly always)

**Recommendation:** Simplify to:
```typescript
{isChatOpen && (planType !== 'static' || isPreviewMode) && (
```
Or even:
```typescript
{isChatOpen && (
```
Since static plans without preview mode are rare/legacy.

---

### UI DISPLAY - "UPGRADE TO RESPONSIVE" MODAL

**Location:** `src/components/PlanWithChat.tsx:197-226`
```typescript
{isChatOpen && planType === 'static' && savedPlanId && (
  <div>
    <h3>Upgrade to Responsive Plan</h3>
    <p>Want to modify your plan with coach chat? Upgrade to a Responsive Plan...</p>
  </div>
)}
```

**Classification:** **Legacy marketing UI** - no longer relevant
**Current Behavior:** Shows "upgrade" prompt if user has saved static plan and tries to open chat
**Keep:** **NO** - this is dead code (all new plans are 'responsive')
**Behavior Impact:** **None** - only shows for old static plans, which users cannot create anymore

**Recommendation:** **DELETE** - no path for users to create static plans

---

### UI DISPLAY - CHAT BUTTON (Responsive Plans)

**Location:** `src/components/PlanWithChat.tsx:228-236`
```typescript
{!isChatOpen && (planType === 'responsive' || planType === 'date_based_preview' ||
  planType === 'date_based_full' || (planType === 'static' && isPreviewMode)) && (
  <button>Open training coach chat</button>
)}
```

**Classification:** **Legacy UI gate** - determines if chat button is shown
**Keep:** YES - but simplify condition (same as line 169)
**Behavior Impact:** **Minor** - only affects when chat button appears

---

### UI DISPLAY - "UPGRADE" BUTTON (Static Plans)

**Location:** `src/components/PlanWithChat.tsx:238-253`
```typescript
{!isChatOpen && planType === 'static' && savedPlanId && (
  <button aria-label="Upgrade to Responsive Plan for chat access">
```

**Classification:** **Legacy marketing UI** - no longer relevant
**Keep:** **NO** - dead code
**Behavior Impact:** **None** - only for old static plans

**Recommendation:** **DELETE**

---

### CHAT INTERFACE - WELCOME MESSAGE

**Location:** `src/components/ChatInterface.tsx:75`
```typescript
if (planType === 'responsive' && chatHistory.length === 0 && planId) {
  const welcomeMessage = { role: 'assistant', content: "Hi, I'm your coach..." };
  onChatUpdate([welcomeMessage]);
}
```

**Classification:** **Active behavior** - shows welcome message for responsive plans
**Keep:** YES - but could apply to all plans with chat
**Behavior Impact:** **Minor cosmetic** - first message in chat

**Recommendation:** Remove check, show welcome for all plans with chat:
```typescript
if (chatHistory.length === 0 && planId) {
```

---

### CHAT INTERFACE - UI TEXT VARIATIONS

**Location:** `src/components/ChatInterface.tsx:466-501`
```typescript
const placeholderText = planType === 'static'
  ? 'Ask to swap days, adjust distances, or modify workouts...'
  : 'Ask to move runs, adjust your schedule, or adapt to life changes...';

<h3>{planType === 'static' ? 'Quick Adjustments Chat' : 'Adaptive Training Coach'}</h3>
<p>{planType === 'static'
  ? 'Make simple tweaks to your training plan'
  : 'Continuously adapt your plan as you train'
}</p>
```

**Classification:** **Legacy UI text** - cosmetic differences only
**Keep:** **NO** - all plans have same functionality
**Behavior Impact:** **None** - purely cosmetic text changes

**Recommendation:** **DELETE** static-specific text, use adaptive text for all

---

### WORKOUT CARD - MOVE/MODIFY BUTTONS

**Location:** `src/components/WorkoutDayCard.tsx:220`
```typescript
{!isBeforeStart && !isCompleted && savedPlanId &&
  (planType === 'responsive' || planType === 'date_based_preview' || planType === 'date_based_full') && (
  <button onClick={onMove}>Move this workout</button>
)}
```

**Classification:** **Legacy UI gate** - controls workout modification buttons
**Keep:** YES - but simplify condition
**Behavior Impact:** **Minor** - hides move/modify buttons for 'static' plans

**Recommendation:** Simplify to show for all saved plans:
```typescript
{!isBeforeStart && !isCompleted && savedPlanId && (
```

---

### PLAN TYPE SELECTOR COMPONENT

**Location:** `src/components/PlanTypeSelector.tsx` (entire file)

**Classification:** **UNUSED CODE** - not imported or used anywhere
**Keep:** **NO** - completely dead code
**Behavior Impact:** **None** - never rendered

**Recommendation:** **DELETE ENTIRE FILE**

---

### CHAT INTERFACE - EXPORT TO GARMIN BUTTON

**Location:** `src/components/ChatInterface.tsx:537`
```typescript
{planId && planType === 'responsive' && (
  <button>Export to Garmin</button>
)}
```

**Classification:** **Legacy feature gate** - restricts Garmin export
**Keep:** **NO** - should be available for all plans
**Behavior Impact:** **Functional** - prevents Garmin export for non-responsive plans

**Recommendation:** Remove check:
```typescript
{planId && (
```

---

### PROP DEFINITIONS (Multiple Components)

**Locations:**
- `src/components/WeekView.tsx:24`
- `src/components/WorkoutDayCard.tsx:26`
- `src/components/TrainingPlanDisplay.tsx:38`
- `src/hooks/useWorkoutOperations.ts:14`

**Classification:** **Legacy prop types** - still needed for TypeScript
**Keep:** YES - required for type safety
**Behavior Impact:** None - purely for type checking

---

### ADMIN DASHBOARD / PROGRESS CHARTS

**Locations:** Multiple references to `ResponsiveContainer` from Recharts library

**Classification:** **UNRELATED** - This is the Recharts component, not plan type
**Keep:** YES - has nothing to do with responsive/static plans
**Behavior Impact:** None

---

### ERROR BOUNDARY

**Location:** `src/components/ErrorBoundary.tsx:23`
```typescript
public static getDerivedStateFromError(error: Error): State {
```

**Classification:** **UNRELATED** - JavaScript `static` class method
**Keep:** YES - has nothing to do with plan types
**Behavior Impact:** None

---

### STRETCHING TIP TEXT

**Location:** `src/components/CalendarView.tsx:110`
```
'...Save static stretching for after your run.'
```

**Classification:** **UNRELATED** - refers to static stretching exercise
**Keep:** YES - has nothing to do with plan types
**Behavior Impact:** None

---

## Current State Summary

### What Actually Happens:

1. **New plan generation:** All plans created via `generatePlan()` are set to `planType = 'responsive'`
2. **Backend response:** The edge function returns `plan_type = 'date_based'` or `'weeks_based'`, but this is **overridden** by frontend state
3. **Database storage:** Plans are saved with `plan_type = 'responsive'` (from frontend state at line 358)
4. **UI behavior:** Chat is available for almost all plans (responsive, date_based_*, or static in preview mode)
5. **Legacy plans:** Old 'static' plans in database still exist but users cannot create new ones

### Behavior Dependencies:

**ZERO** critical behaviors depend on `planType === 'responsive'`:
- ✅ Coach intervention (RPE feedback): Now works for all plans (we just fixed this)
- ✅ Chat interface: Available for responsive/date_based plans (nearly all plans)
- ✅ Workout modifications: Only gated for display of move/modify buttons
- ✅ Garmin export: Unnecessarily restricted to responsive plans

### Legacy vs Current:

| Feature | Original Intent | Current Reality |
|---------|----------------|-----------------|
| Static plans | Limited, non-adaptive | **Users cannot create** |
| Responsive plans | Full features, adaptive | **All new plans** |
| Plan type distinction | Pricing/feature tier | **Deprecated concept** |
| UI differences | Different capabilities | **Cosmetic text only** |

---

## Recommendations

### Phase 1: Safe Cleanup (No Breaking Changes)

1. **Add comments to legacy code:**
   - Mark all responsive/static checks with `// LEGACY: Kept for backward compatibility with old plans`
   - Document that new plans are always 'responsive'

2. **Simplify conditions:**
   - Replace complex plan type checks with simpler equivalents
   - Example: `(planType !== 'static' || isPreviewMode)` instead of listing all types

### Phase 2: Remove Dead Code (Low Risk)

1. **Delete unused component:** `src/components/PlanTypeSelector.tsx`
2. **Delete upgrade prompts:** Lines 197-226 and 238-253 in PlanWithChat.tsx
3. **Remove static-specific chat text:** Merge into single adaptive text

### Phase 3: Unify Behavior (Requires Testing)

1. **Remove Garmin export restriction:** Make available for all plans
2. **Show move/modify buttons for all saved plans**
3. **Show welcome message for all plans with chat**
4. **Simplify chat availability logic**

### Phase 4: Data Migration (Future)

1. Update all `plan_type = 'responsive'` to `plan_type = 'adaptive'` (clearer name)
2. Consider collapsing to single plan type or removing column entirely
3. Remove plan_type check constraints from database

---

## Risk Assessment

### LOW RISK (Safe to change):
- Delete PlanTypeSelector component (unused)
- Delete upgrade prompts (user cannot create static plans)
- Add explanatory comments

### MEDIUM RISK (Requires testing):
- Simplify UI condition logic
- Remove Garmin export restriction
- Show move/modify buttons for all plans

### HIGH RISK (Requires careful migration):
- Change database plan_type values
- Remove plan_type column entirely
- Refactor type definitions

---

## Conclusion

The "responsive vs static" concept is **architecturally deprecated** but **lexically present** throughout the codebase. The actual runtime behavior treats all new plans as "responsive" - the gates are mostly cosmetic and only affect legacy plans users cannot create anymore.

**Current behavior does NOT depend on `planType === 'responsive'`** - we've already removed that dependency from the coach intervention feature, and other features either:
1. Work for nearly all plan types (chat, modifications)
2. Are purely cosmetic (text differences)
3. Are unnecessarily restrictive (Garmin export)

The codebase is safe to cleanup incrementally without breaking existing functionality.
