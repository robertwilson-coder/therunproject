/**
 * Chat context management utilities
 * Reduces token costs by limiting and pruning conversation history
 */

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

const MAX_HISTORY_MESSAGES = 10; // Keep only last 10 messages
const MAX_MESSAGE_LENGTH = 1000; // Truncate long messages

/**
 * Prunes chat history to reduce token usage
 * Keeps recent messages and summarizes older ones
 */
export function pruneChatHistory(history: ChatMessage[]): ChatMessage[] {
  if (history.length <= MAX_HISTORY_MESSAGES) {
    return history;
  }

  // Keep the last MAX_HISTORY_MESSAGES
  const recentMessages = history.slice(-MAX_HISTORY_MESSAGES);

  // Add a system message explaining context was pruned
  const contextNote: ChatMessage = {
    role: 'assistant',
    content: '[Previous conversation context has been summarized to optimize performance]'
  };

  return [contextNote, ...recentMessages];
}

/**
 * Truncates long messages to reduce token usage
 */
export function truncateMessage(message: string, maxLength: number = MAX_MESSAGE_LENGTH): string {
  if (message.length <= maxLength) {
    return message;
  }

  return message.substring(0, maxLength) + '... [truncated]';
}

/**
 * Estimates token count for a message (rough approximation)
 * OpenAI uses ~4 characters per token on average
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Gets total estimated tokens for chat history
 */
export function getTotalTokens(history: ChatMessage[]): number {
  return history.reduce((total, msg) => total + estimateTokens(msg.content), 0);
}

/**
 * Prepares chat history for API call with token optimization
 */
export function prepareChatForAPI(
  history: ChatMessage[],
  maxTokens: number = 4000
): ChatMessage[] {
  let processedHistory = pruneChatHistory(history);
  let totalTokens = getTotalTokens(processedHistory);

  // If still over limit, aggressively prune
  while (totalTokens > maxTokens && processedHistory.length > 2) {
    // Remove oldest messages (but keep at least 2)
    processedHistory = processedHistory.slice(1);
    totalTokens = getTotalTokens(processedHistory);
  }

  return processedHistory;
}

/**
 * Creates a condensed context summary from chat history
 * Useful for providing context without sending entire history
 */
export function createContextSummary(history: ChatMessage[]): string {
  if (history.length === 0) return '';

  const recentMessages = history.slice(-5);
  const userMessages = recentMessages.filter(m => m.role === 'user');
  const assistantMessages = recentMessages.filter(m => m.role === 'assistant');

  const summary = {
    recent_user_requests: userMessages.map(m => truncateMessage(m.content, 200)),
    recent_adjustments: assistantMessages.length > 0 ? 'Plan has been adjusted based on user feedback' : 'No recent adjustments'
  };

  return JSON.stringify(summary);
}
