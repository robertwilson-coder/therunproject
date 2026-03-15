# Gold Standard Chat System - Frontend Integration Guide

## Overview

This system eliminates the "wrong Tuesday" problem permanently through a **three-phase commit architecture**:

1. **Proposal Phase**: LLM classifies intent and extracts reference phrases
2. **Resolution Phase**: Backend deterministically resolves dates, detects ambiguity
3. **Application Phase**: User confirms, changes apply with full audit trail

## Architecture Diagram

```
User Message
    ↓
[chat-training-plan] → Creates Proposal (no dates selected)
    ↓
Frontend receives: { proposal_id, requires_modification, reference_phrases }
    ↓
[resolve-proposal] → Resolves ISO dates deterministically
    ↓
Frontend receives one of:
    - { ambiguity_detected, question, options } → Show picker
    - { requires_confirmation, resolved_targets } → Show confirmation
    - { ready_to_apply, resolution_id, operations } → Show preview
    ↓
User confirms/selects
    ↓
[apply-proposal] → Applies changes with audit log
    ↓
Plan updated, audit log created
```

## Frontend Implementation

### 1. Updated Chat Message Handler

```typescript
async function handleChatMessage(message: string) {
  // Step 1: Create proposal
  const proposalResponse = await fetch(
    `${supabaseUrl}/functions/v1/chat-training-plan`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${supabaseAnonKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        message,
        chatHistory,
        planData,
        planId,
        planType,
        answers,
        currentWeekNumber,
        planStartDate,
        todaysDate,
        completedWorkouts
      })
    }
  );

  const proposalData = await proposalResponse.json();

  // Display coach explanation
  addMessageToChat('assistant', proposalData.response);

  // If no modification needed, stop here
  if (!proposalData.requires_modification) {
    return;
  }

  // Step 2: Resolve proposal to ISO dates
  const resolutionResponse = await fetch(
    `${supabaseUrl}/functions/v1/resolve-proposal`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${supabaseAnonKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        proposal_id: proposalData.proposal_id
      })
    }
  );

  const resolutionData = await resolutionResponse.json();

  // Handle ambiguity
  if (resolutionData.ambiguity_detected) {
    showAmbiguityPicker(resolutionData.question, resolutionData.options, proposalData.proposal_id);
    return;
  }

  // Handle confirmation requirement
  if (resolutionData.requires_confirmation) {
    showConfirmationDialog(
      resolutionData.confirmation_message,
      resolutionData.resolved_targets,
      resolutionData.resolution_id
    );
    return;
  }

  // Show preview and apply button
  showApprovalPreview(resolutionData);
}
```

### 2. Ambiguity Picker Component

```typescript
function showAmbiguityPicker(
  question: string,
  options: ResolvedTarget[],
  proposalId: string
) {
  // Display modal: "Which Tuesday did you mean?"
  // Show options with full context:
  // - "Tuesday, Feb 11 (last week) - Already passed"
  // - "Tuesday, Feb 18 (next week) - In 5 days"

  const modal = createModal({
    title: question,
    content: options.map(opt => ({
      label: opt.humanLabel,
      badge: opt.relative, // PAST, TODAY, FUTURE
      isCompleted: opt.isCompleted,
      onClick: () => handleUserSelection(proposalId, opt.isoDate)
    }))
  });
}

async function handleUserSelection(proposalId: string, selectedDate: string) {
  // Re-resolve with user's selection
  const resolutionResponse = await fetch(
    `${supabaseUrl}/functions/v1/resolve-proposal`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${supabaseAnonKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        proposal_id: proposalId,
        user_selection: selectedDate
      })
    }
  );

  const resolutionData = await resolutionResponse.json();

  // Now show preview
  showApprovalPreview(resolutionData);
}
```

### 3. Approval Preview Component

```typescript
function showApprovalPreview(resolutionData: any) {
  // Display what will change with EXACT dates
  const preview = resolutionData.operations.map(op => ({
    date: op.iso_date,
    humanLabel: op.human_label,
    action: op.action,
    currentWorkout: getCurrentWorkout(op.iso_date),
    futureWorkout: op.action === 'cancel' ? 'Rest' : op.new_workout,
    badge: op.relative // PAST/TODAY/FUTURE
  }));

  const modal = createConfirmationModal({
    title: 'Confirm Changes',
    explanation: resolutionData.coach_explanation,
    changes: preview,
    onConfirm: () => applyResolution(resolutionData.resolution_id),
    onCancel: () => closeModal()
  });
}
```

### 4. Apply Resolution

```typescript
async function applyResolution(resolutionId: string) {
  const applyResponse = await fetch(
    `${supabaseUrl}/functions/v1/apply-proposal`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${supabaseAnonKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        resolution_id: resolutionId,
        user_confirmed: true
      })
    }
  );

  const result = await applyResponse.json();

  if (result.success) {
    // Refresh plan data
    await refreshPlan();

    // Show success message
    showToast('Changes applied successfully', 'success');

    // Add to chat
    addMessageToChat('assistant', result.coach_explanation);
  }
}
```

## UI Component Examples

### Ambiguity Picker

```tsx
<Modal open={showAmbiguity} title={ambiguityQuestion}>
  {ambiguityOptions.map(option => (
    <Button
      key={option.isoDate}
      onClick={() => handleUserSelection(option.isoDate)}
      className="w-full text-left"
    >
      <div className="flex items-center justify-between">
        <div>
          <div className="font-semibold">{option.humanLabel}</div>
          <div className="text-sm text-gray-500">
            {option.weekday} - Week {option.weekNumber}
          </div>
        </div>
        <div>
          {option.relative === 'PAST' && (
            <Badge variant="secondary">Past</Badge>
          )}
          {option.relative === 'FUTURE' && (
            <Badge variant="primary">Future</Badge>
          )}
          {option.isCompleted && (
            <Badge variant="success">Completed</Badge>
          )}
        </div>
      </div>
    </Button>
  ))}
</Modal>
```

### Approval Preview

```tsx
<Modal open={showPreview} title="Confirm Changes">
  <div className="space-y-4">
    <p className="text-gray-700">{coachExplanation}</p>

    <div className="border rounded-lg divide-y">
      {operations.map(op => (
        <div key={op.iso_date} className="p-4">
          <div className="flex items-center justify-between mb-2">
            <div className="font-semibold">{op.human_label}</div>
            <Badge variant={op.relative === 'PAST' ? 'warning' : 'default'}>
              {op.relative}
            </Badge>
          </div>

          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <div className="text-gray-500">Current:</div>
              <div className="font-medium">{op.before_workout}</div>
            </div>
            <div>
              <div className="text-gray-500">After:</div>
              <div className="font-medium text-blue-600">{op.after_workout}</div>
            </div>
          </div>
        </div>
      ))}
    </div>

    <div className="flex gap-2">
      <Button onClick={handleApply} variant="primary">
        Apply Changes
      </Button>
      <Button onClick={handleCancel} variant="secondary">
        Cancel
      </Button>
    </div>
  </div>
</Modal>
```

## Key Frontend Changes Required

### ChatInterface.tsx

1. Update `sendMessage` to use three-phase flow
2. Add state for `currentProposal`, `currentResolution`
3. Add modal for ambiguity picker
4. Add modal for approval preview

### Sample State Management

```typescript
const [currentProposal, setCurrentProposal] = useState<Proposal | null>(null);
const [currentResolution, setCurrentResolution] = useState<Resolution | null>(null);
const [showAmbiguityPicker, setShowAmbiguityPicker] = useState(false);
const [ambiguityData, setAmbiguityData] = useState<AmbiguityData | null>(null);
const [showApprovalPreview, setShowApprovalPreview] = useState(false);
const [previewData, setPreviewData] = useState<PreviewData | null>(null);
```

## Error Handling

```typescript
// Handle validation errors
if (resolutionData.validation_errors) {
  showErrorModal({
    title: 'Cannot Make This Change',
    errors: resolutionData.validation_errors.map(err => err.message)
  });
  return;
}

// Handle completed workout protection
if (error.code === 'COMPLETED_WORKOUT_IMMUTABLE') {
  showToast('Cannot modify completed workouts', 'error');
  return;
}
```

## Testing Checklist

- [ ] "Delete Tuesday" on Wednesday triggers ambiguity picker
- [ ] "Delete last Tuesday" resolves to correct past date
- [ ] "Delete next Tuesday" resolves to correct future date
- [ ] Completed workouts cannot be modified
- [ ] Past workouts require confirmation
- [ ] Preview shows exact ISO dates before applying
- [ ] Audit log captures all changes
- [ ] Reinstate restores cancelled workouts

## Success Criteria

✅ **No silent date assumptions** - All dates shown to user before applying
✅ **Ambiguity always detected** - "Tuesday" triggers picker if unclear
✅ **Past workout protection** - Requires explicit confirmation
✅ **Completed workout immutability** - System prevents modification
✅ **Full audit trail** - Every change logged with ISO dates
✅ **Reversible operations** - Reinstate works correctly

## Migration Notes

The old `chat-training-plan/index.ts` can remain for backward compatibility during migration. Once frontend is updated:

1. Deploy new edge functions
2. Update frontend to use new flow
3. Test thoroughly
4. Remove old edge function after verification
