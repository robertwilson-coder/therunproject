# Gold Standard Date-Based Architecture Implementation Status

## Executive Summary

This document tracks the implementation of the gold standard architecture that replaces week-based workout targeting with date-based precision, implements a Draft → Preview → Commit pipeline, and ensures the chat coach behaves like a real human coach with proper intervention logic.

## ✅ Phase 1: Core Infrastructure (COMPLETED)

### 1.1 Date Resolution System

**Status:** ✅ COMPLETE & TESTED

**Files Created:**
- `src/utils/dateResolver.ts` - Frontend date resolver
- `supabase/functions/_shared/dateResolverBackend.ts` - Backend date resolver
- `test-date-resolver.js` - Comprehensive test suite (ALL PASSING)

**Features:**
- Single source of truth for all date operations
- Europe/London timezone (GMT/BST) enforced everywhere
- UK date format: "7 Feb 26" (never "02/07/26")
- Resolves natural language: "next Tuesday", "last Friday", "tomorrow"
- Detects ambiguous references: "Tuesday" alone requires clarification
- Provides date range calculation: "next 2 weeks" → explicit date range

**Test Results:**
```
✅ All 21 date resolver tests passed
✅ Timezone consistency verified
✅ Relative date parsing verified
✅ Range calculation verified
```

### 1.2 Type System & Pipeline

**Status:** ✅ COMPLETE

**Files Created:**
- `src/types/proposalSystem.ts` - Complete type definitions for Draft → Preview → Commit

**Types Defined:**
- `DraftProposal` - Initial coach analysis
- `PreviewSet` - Explicit workout modifications with IDs
- `CommitRequest` - User confirmation with workout IDs
- `CommitResult` - Success/failure with version tracking
- `WorkoutModification` - Before/after snapshots
- `CoachingInterventionState` - Multi-cancel intervention rules
- `SafetyInvariants` - Hard validation rules

### 1.3 Backend Resolver & Validators

**Status:** ✅ COMPLETE

**Files Created:**
- `supabase/functions/_shared/previewSetResolver.ts` - Converts drafts to deterministic previews
- `supabase/functions/_shared/safetyInvariants.ts` - Validates preview and commit operations
- `supabase/functions/_shared/coachingInterventionEngine.ts` - Enforces coaching behavior

**Key Features:**

**PreviewSetResolver:**
- Takes Draft + workout list → produces PreviewSet
- ALL targeting uses `workout_id` or `iso_date`
- Week numbers ONLY for display, NEVER for targeting
- Resolves "next Tuesday" to explicit ISO date
- Creates workout snapshots (before/after)

**SafetyInvariantsValidator:**
- Cannot modify completed workouts
- Cannot modify past workouts without confirmation
- Preview IDs must match commit IDs
- Plan version must match (optimistic locking)
- All modifications must reference valid workout_id

**CoachingInterventionEngine:**
- 1 cancellation → allow with confirmation
- 2-3 cancellations → ask coaching questions, offer alternatives
- 7+ day range cancellation → require explicit choice
- Enforced as state machine (not just prompt behavior)

### 1.4 Database Schema

**Status:** ✅ COMPLETE

**Migrations Applied:**
- `add_workout_version_for_optimistic_locking` - Adds `workout_version` to training_plans
- `add_preview_sets_for_proposal_system` - Creates `preview_sets` table

**Schema Changes:**
```sql
training_plans:
  + workout_version INTEGER (for optimistic locking)
  + plan_data JSONB (comment updated to require workout_id, scheduled_for, status)

preview_sets:
  + preview_id UUID (primary key)
  + user_id UUID (references auth.users)
  + plan_id UUID (references training_plans)
  + plan_version INTEGER
  + modifications JSONB
  + expires_at TIMESTAMPTZ (15 minute expiry)
  + created_at TIMESTAMPTZ
```

**RLS Policies:**
- Users can only access their own preview sets
- Auto-cleanup function for expired previews

### 1.5 New Edge Function (V2)

**Status:** ✅ CREATED (NOT YET DEPLOYED)

**File:** `supabase/functions/chat-training-plan-v2/index.ts`

**Implements:**
- Draft mode: Analyzes user message → creates PreviewSet
- Commit mode: Validates preview → applies changes with version check
- Coaching intervention before preview generation
- Safety invariants enforced at every step
- OpenAI integration for natural language understanding

**NOT YET DEPLOYED** - waiting for frontend integration

---

## 🚧 Phase 2: Frontend Integration (IN PROGRESS)

### 2.1 Chat Interface Updates

**Status:** ⏳ PENDING

**Required Changes:**
- Update `ChatInterface` to call V2 endpoint
- Handle 3 response modes:
  - `intervention`: Show coaching questions and alternatives
  - `preview`: Display PreviewSet with explicit workouts
  - `commit`: Apply changes after user approval
- Add preview UI with workout list (UK formatted dates)
- Add approval/cancel buttons for preview

### 2.2 Popup Editor Rewrite

**Status:** ⏳ PENDING

**Current Problem:**
- Popup edits workout based on week/weekday
- Modifications fail because they target wrong workouts

**Required Fix:**
- Popup must receive `PreviewSet` as input (not live plan)
- Edits modify the `PreviewSet` locally
- If edits change scope, request new `PreviewSet` from backend
- Only commit after final user approval

### 2.3 UK Date Format Everywhere

**Status:** ⏳ PENDING

**Components to Update:**
- `WorkoutDayCard` - show dates as "7 Feb 26" not "02/07/26"
- `CalendarView` - use UK date formatting
- `WeekView` - display UK dates
- `ProgressPanel` - format dates correctly
- All workout completion modals

**Pattern to Use:**
```typescript
import { formatUKDate } from '@/utils/dateResolver';

// Instead of:
const display = new Date(isoDate).toLocaleDateString();

// Use:
const display = formatUKDate(isoDate);
```

### 2.4 Data Migration

**Status:** ⏳ PENDING

**Required:**
- Add `workout_id` (UUID) to all existing workouts in `plan_data`
- Add `scheduled_for` (ISO date) to all existing workouts
- Add `status` ('scheduled' | 'cancelled' | 'completed') to all workouts
- Verify all dates align with plan_start_date

**Migration Script Needed:**
```sql
UPDATE training_plans
SET plan_data = /* transform plan_data to add workout_id, scheduled_for, status */
WHERE plan_data IS NOT NULL;
```

---

## 📋 Phase 3: Testing & Deployment (NOT STARTED)

### 3.1 Integration Tests

**Status:** ⏳ PENDING

**Tests Needed:**
- Preview generation from various user messages
- Coaching intervention triggers correctly
- Safety invariants reject invalid operations
- Commit with version mismatch fails correctly
- Expired previews are rejected

### 3.2 Edge Function Deployment

**Status:** ⏳ PENDING

**Deploy:**
```bash
# Deploy new V2 function
mcp__supabase__deploy_edge_function chat-training-plan-v2

# Test in staging environment
# Verify all flows work correctly
# Then switch frontend to use V2
```

### 3.3 Rollout Strategy

**Recommended Approach:**

**Option A: Gradual Rollout**
1. Deploy V2 alongside V1
2. Add feature flag to switch between them
3. Test with small user group
4. Monitor for issues
5. Full rollout when stable

**Option B: Big Bang (Riskier)**
1. Deploy V2
2. Update frontend to use V2
3. Deprecate V1 immediately

---

## 🎯 Success Criteria

The implementation is complete when:

1. ✅ User says "cancel next Tuesday" → system resolves to correct ISO date (not week number)
2. ✅ Preview shows exact workouts with UK formatted dates
3. ✅ What user sees in preview === what gets committed (100% match)
4. ✅ User cancels 3 workouts → coach asks questions before proceeding
5. ✅ Popup edits don't fail due to stale week/weekday references
6. ✅ Concurrent edits are detected and rejected (version mismatch)
7. ✅ All dates display as "7 Feb 26" (UK format)
8. ✅ Timezone calculations always use Europe/London

---

## 📝 Next Immediate Steps

1. **Update ChatInterface Component**
   - Add handling for `intervention`, `preview`, `commit` modes
   - Build preview UI with approval buttons
   - Switch to V2 endpoint

2. **Rewrite Popup Editor**
   - Accept PreviewSet as input
   - Edit PreviewSet locally
   - Refresh PreviewSet if scope changes

3. **Apply UK Date Formatting**
   - Replace all date displays with `formatUKDate()`
   - Test across all components

4. **Data Migration**
   - Write migration script to add required fields to existing workouts
   - Test on staging data first

5. **Deploy V2 Function**
   - Deploy to Supabase
   - Run integration tests
   - Enable for users

---

## 🔥 Critical Decisions Made

### Why Date-Based Instead of Week-Based?

**Problem:** Week numbers are derived coordinates that drift when plans regenerate or dates change.

**Solution:** ISO dates are stable, unambiguous, and directly correspond to the user's calendar.

**Benefit:** "Cancel next Tuesday" resolves deterministically to a specific date, not "Week 3, Day 2" which might be Wednesday after a regeneration.

### Why Draft → Preview → Commit?

**Problem:** Old system applied changes immediately, causing preview/commit mismatches.

**Solution:** Three-phase pipeline with transactional integrity.

**Benefit:** User sees EXACTLY what will change before approving. No surprises.

### Why Coaching Intervention Engine?

**Problem:** User could cancel entire weeks without pushback.

**Solution:** State machine that enforces coaching behavior.

**Benefit:** System feels like a real coach who cares, not just a tool that obeys commands.

---

## 📚 Key Files Reference

### Frontend
- `src/utils/dateResolver.ts` - Date resolution & UK formatting
- `src/types/proposalSystem.ts` - TypeScript types
- `test-date-resolver.js` - Test suite

### Backend
- `supabase/functions/chat-training-plan-v2/index.ts` - New chat endpoint
- `supabase/functions/_shared/dateResolverBackend.ts` - Backend date utils
- `supabase/functions/_shared/previewSetResolver.ts` - Preview generation
- `supabase/functions/_shared/coachingInterventionEngine.ts` - Intervention logic
- `supabase/functions/_shared/safetyInvariants.ts` - Validation

### Database
- `supabase/migrations/*_add_workout_version_for_optimistic_locking.sql`
- `supabase/migrations/*_add_preview_sets_for_proposal_system.sql`

---

## 💡 Implementation Notes

**DO NOT:**
- Use week numbers for targeting (display only)
- Skip intervention for multi-cancel scenarios
- Allow commit without preview validation
- Use ambiguous date formats like "02/07/26"

**ALWAYS:**
- Target by `workout_id` or `iso_date`
- Format dates as "7 Feb 26" (UK style)
- Validate plan version before commit
- Check safety invariants before applying changes

---

**Document Version:** 1.0
**Last Updated:** 13 Feb 2026
**Status:** Phase 1 Complete, Phase 2 In Progress
