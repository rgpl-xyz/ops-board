import type { OpsBoardProblem } from '../../../data-access';

export interface BriefFailureView {
  readonly message: string;
  /** Whether asking again could succeed now. */
  readonly retry: boolean;
}

/** What went wrong with a brief, in words that say what to do next. */
export function describeBriefFailure(problem: OpsBoardProblem): BriefFailureView {
  switch (problem.code) {
    case 'assistant_disabled':
      return {
        message: 'AI assistance is turned off for this environment. The incident record and timeline are unaffected.',
        retry: false,
      };
    case 'assistant_daily_limit': {
      const wait = problem.retryAfterSeconds ? `, in about ${aboutWait(problem.retryAfterSeconds)}` : '';
      return {
        message: `Today's AI allowance is used up. It resets at 00:00 UTC${wait}.`,
        retry: false,
      };
    }
    case 'assistant_visitor_limit':
      return {
        message: `You've asked for several new briefs in a short time. Try again in about ${aboutWait(problem.retryAfterSeconds ?? 600)}.`,
        retry: true,
      };
    case 'assistant_busy':
      return {
        message: `AI assistance is busy. Try again in ${aboutWait(problem.retryAfterSeconds ?? 5)}.`,
        retry: true,
      };
    case 'assistant_provider_unavailable':
      return {
        message: "The AI provider isn't responding. Try again in a minute, or read the timeline in the meantime.",
        retry: true,
      };
    case 'assistant_unverified_response':
      return {
        message: "The AI answer didn't pass the checks against this incident's records, so it isn't shown. Try again.",
        retry: true,
      };
    case 'unavailable':
      return { message: 'This incident is no longer available.', retry: false };
    case 'forbidden':
    case 'identity_unavailable':
      return { message: "You don't have access to AI assistance for this incident.", retry: false };
    default:
      return {
        message: 'The brief could not be generated. Check your connection and try again.',
        retry: true,
      };
  }
}

function aboutWait(seconds: number): string {
  if (seconds < 90) {
    return plural(Math.max(1, Math.ceil(seconds)), 'second');
  }
  if (seconds < 90 * 60) {
    return plural(Math.round(seconds / 60), 'minute');
  }
  return plural(Math.round(seconds / 3600), 'hour');
}

function plural(count: number, unit: string): string {
  return `${count} ${unit}${count === 1 ? '' : 's'}`;
}
