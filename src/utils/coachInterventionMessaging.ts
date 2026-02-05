import { supabase } from '../lib/supabase';
import { logger } from './logger';
import { ChatMessage } from '../types';

interface CoachInterventionMetadata {
  source: 'rpe_deviation' | 'pattern_based';
  completionId?: string;
  workoutKey: string;
  deviationValue?: number;
  timestamp: string;
}

interface SendCoachInterventionMessageParams {
  userId: string;
  planId: string;
  content: string;
  metadata: CoachInterventionMetadata;
  onChatUpdate?: (messages: ChatMessage[]) => void;
  currentChatHistory?: ChatMessage[];
  onInterventionSent?: (params: { source: string; workoutKey: string; completionId?: string }) => void;
}

/**
 * Sends a coach intervention message to the chat thread.
 * This creates an ASSISTANT-role message (FROM coach TO user), not a user draft.
 *
 * Dedupe: Checks if a message with the same source + workoutKey + completionId already exists.
 * This prevents spam on re-renders while allowing new messages when:
 * - The completion is edited and saved again (new completionId)
 * - Different completions of the same workout trigger intervention
 */
export async function sendCoachInterventionMessage({
  userId,
  planId,
  content,
  metadata,
  onChatUpdate,
  currentChatHistory = [],
  onInterventionSent
}: SendCoachInterventionMessageParams): Promise<boolean> {
  console.log('[DEBUG-INTERVENTION] sendCoachInterventionMessage CALLED', {
    userId,
    planId,
    hasOnChatUpdate: !!onChatUpdate,
    currentChatHistoryLength: currentChatHistory.length,
    metadata
  });

  try {
    logger.info('[CoachIntervention] Checking for existing intervention message', {
      source: metadata.source,
      workoutKey: metadata.workoutKey
    });

    // DEDUPE: Check if we already sent a message for this workout
    const { data: existingMessages, error: checkError } = await supabase
      .from('chat_messages')
      .select('id, metadata')
      .eq('user_id', userId)
      .eq('training_plan_id', planId)
      .eq('role', 'assistant')
      .not('metadata', 'is', null);

    console.log('[DEBUG-INTERVENTION] Dedupe query result', {
      existingMessagesCount: existingMessages?.length || 0,
      checkError: checkError?.message
    });

    if (checkError) {
      logger.error('[CoachIntervention] Error checking existing messages:', checkError);
      console.log('[DEBUG-INTERVENTION] Check error, continuing anyway');
      // Continue anyway - better to send duplicate than miss intervention
    }

    if (existingMessages) {
      // Check if any message has matching source + workoutKey + completionId
      let matchedMessage = null;
      const isDuplicate = existingMessages.some(msg => {
        const meta = msg.metadata as CoachInterventionMetadata | null;

        // Match requires: same source AND same workoutKey
        const sourceAndKeyMatch = meta?.source === metadata.source && meta?.workoutKey === metadata.workoutKey;

        if (!sourceAndKeyMatch) {
          return false;
        }

        // If NEW message has completionId, also require completionId match
        // This allows re-send if workout is edited (new completionId)
        if (metadata.completionId) {
          const completionIdMatch = meta?.completionId === metadata.completionId;
          console.log('[DEBUG-INTERVENTION] Checking message', {
            msgId: msg.id,
            msgCompletionId: meta?.completionId,
            newCompletionId: metadata.completionId,
            completionIdMatch,
            sourceAndKeyMatch
          });
          if (completionIdMatch) {
            matchedMessage = msg;
            return true;
          }
          return false;
        }

        // If NEW message has no completionId (pattern-based), match on source+key only
        console.log('[DEBUG-INTERVENTION] Checking message (no completionId)', {
          msgId: msg.id,
          msgMeta: meta,
          sourceAndKeyMatch
        });
        if (sourceAndKeyMatch) {
          matchedMessage = msg;
          return true;
        }
        return false;
      });

      console.log('[DEBUG-INTERVENTION] Dedupe decision', {
        isDuplicate,
        matchedMessageId: matchedMessage?.id,
        matchedCompletionId: (matchedMessage?.metadata as CoachInterventionMetadata)?.completionId
      });

      if (isDuplicate) {
        logger.info('[CoachIntervention] Skipping duplicate intervention message', {
          source: metadata.source,
          workoutKey: metadata.workoutKey,
          completionId: metadata.completionId,
          matchedCompletionId: (matchedMessage?.metadata as CoachInterventionMetadata)?.completionId
        });
        console.log('[DEBUG-INTERVENTION] SKIPPED - duplicate detected for completionId:', metadata.completionId);
        return false;
      }
    }

    logger.info('[CoachIntervention] Sending coach intervention message', {
      source: metadata.source,
      workoutKey: metadata.workoutKey,
      contentPreview: content.substring(0, 50) + '...'
    });

    console.log('[DEBUG-INTERVENTION] Inserting message to DB', {
      userId,
      planId,
      role: 'assistant',
      contentLength: content.length,
      metadata
    });

    // Insert as ASSISTANT role (from coach)
    const { error: insertError } = await supabase
      .from('chat_messages')
      .insert({
        user_id: userId,
        training_plan_id: planId,
        role: 'assistant',
        content,
        metadata
      });

    if (insertError) {
      logger.error('[CoachIntervention] Error saving intervention message:', insertError);
      console.log('[DEBUG-INTERVENTION] DB INSERT FAILED', {
        error: insertError.message,
        code: insertError.code,
        details: insertError.details
      });
      return false;
    }

    console.log('[DEBUG-INTERVENTION] DB INSERT SUCCESS');
    logger.info('[CoachIntervention] Successfully saved intervention message to database');

    // Notify that intervention was sent (for auto-opening chat)
    if (onInterventionSent) {
      console.log('[DEBUG-INTERVENTION] Calling onInterventionSent callback');
      onInterventionSent({
        source: metadata.source,
        workoutKey: metadata.workoutKey,
        completionId: metadata.completionId
      });
    }

    // Update local chat history if callback provided
    if (onChatUpdate) {
      console.log('[DEBUG-INTERVENTION] onChatUpdate callback EXISTS, creating message');
      const newMessage: ChatMessage = {
        role: 'assistant',
        content
      };

      const updatedHistory = [...currentChatHistory, newMessage];
      console.log('[DEBUG-INTERVENTION] Calling onChatUpdate', {
        oldLength: currentChatHistory.length,
        newLength: updatedHistory.length,
        newMessageRole: newMessage.role,
        newMessageContentPreview: newMessage.content.substring(0, 50)
      });

      onChatUpdate(updatedHistory);

      console.log('[DEBUG-INTERVENTION] onChatUpdate CALLED');
      logger.info('[CoachIntervention] Updated local chat history');
    } else {
      console.log('[DEBUG-INTERVENTION] WARNING: onChatUpdate callback is NULL/undefined');
    }

    console.log('[DEBUG-INTERVENTION] Returning TRUE (success)');
    return true;
  } catch (error) {
    logger.error('[CoachIntervention] Unexpected error sending intervention:', error);
    return false;
  }
}

/**
 * Generates a dedupe key for in-memory fallback.
 * Format: source:workoutKey
 */
export function generateInterventionKey(source: string, workoutKey: string): string {
  return `${source}:${workoutKey}`;
}
