export type GeminiReviewState = 
  | 'UNREQUESTED'
  | 'PENDING_INITIAL' 
  | 'PENDING_FINAL' 
  | 'DELIVERED' 
  | 'ERROR';

export interface GeminiReviewStatus {
  state: GeminiReviewState;
  requestIteration: number;
  errorMessage?: string;
}

/**
 * Service to parse Gemini Code Assist event logs or PR comments
 * and determine the exact state of the most recent review request.
 */
export class GeminiReviewStatusService {
  
  /**
   * Analyzes the consolidated status string or PR comment thread.
   */
  public static determineStatus(logText: string): GeminiReviewStatus {
    if (!logText) {
      return { state: 'UNREQUESTED', requestIteration: 0 };
    }

    const normalizedText = logText.toLowerCase();
    
    // Regex to find all instances of "/gemini review" and capture the iteration number if present.
    // Matches: "/gemini review" OR "/gemini review (#2)" OR "/gemini review (#3)", etc.
    const requestRegex = /\/gemini review(?: \(#(\d+)\))?/g;
    
    let match: RegExpExecArray | null;
    let latestRequestIndex = -1;
    let requestIteration = 1;

    // Loop through all matches to find the LAST one in the string
    while ((match = requestRegex.exec(normalizedText)) !== null) {
      latestRequestIndex = match.index;
      if (match[1]) {
        requestIteration = parseInt(match[1], 10);
      } else {
        requestIteration = 1;
      }
    }

    // If no request was found in the text
    if (latestRequestIndex === -1) {
      return { state: 'UNREQUESTED', requestIteration: 0 };
    }

    // Isolate the log text that occurred AFTER the latest request
    // This prevents older completed requests from overriding the current pending/error state.
    const activeLogSegment = normalizedText.substring(latestRequestIndex);

    // 1. Check for Terminal Error States
    if (activeLogSegment.includes('max requests reached')) {
      return { 
        state: 'ERROR', 
        requestIteration, 
        errorMessage: 'Gemini review failed: Max requests reached in 24 hours.' 
      };
    }
    
    if (activeLogSegment.includes('system error') || activeLogSegment.includes('failed to run')) {
      return { 
        state: 'ERROR', 
        requestIteration, 
        errorMessage: 'Gemini review failed due to an internal system error.' 
      };
    }

    // 2. Check for Terminal Success State
    // If the final review was delivered, the iteration is complete.
    if (activeLogSegment.includes('final review delivered')) {
      return { state: 'DELIVERED', requestIteration };
    }

    // 3. Check for In-Progress States
    // If we have an initial message or an explicit pending flag, the review is actively processing.
    if (activeLogSegment.includes('final review pending') || activeLogSegment.includes('initial message')) {
      return { state: 'PENDING_FINAL', requestIteration };
    }

    // 4. Default to Initial Pending State
    // A request was found, but no subsequent bot activity has been logged yet.
    return { state: 'PENDING_INITIAL', requestIteration };
  }
}
