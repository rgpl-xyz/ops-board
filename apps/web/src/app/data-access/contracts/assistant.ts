import type { RevisionString } from './common';

/** Mirrors Application `Assistant/IncidentBriefDtos.cs`. */
export interface AssistantStatusDto {
  enabled: boolean;
  /** True when no model is connected and briefs come from fixed rules. */
  simulated: boolean;
  /** True when people may also type questions about an incident. */
  questions: boolean;
}

/** A statement in a brief; every ref is one of the brief's sources. */
export interface BriefStatementDto {
  text: string;
  refs: string[];
}

/** A record a brief cites, described by the server from stored data. */
export interface BriefSourceDto {
  ref: string;
  label: string;
  actor: string | null;
  occurredAt: string;
  detail: string | null;
}

/** Mirrors Application `Assistant/IncidentAnswerDtos.cs`. */
export interface IncidentAnswerDto {
  incidentId: string;
  answeredAt: string;
  provider: string;
  model: string;
  /** No model wrote it: the offline fake provider. */
  simulated: boolean;
  /** False when the records do not answer the question; there are then no sentences. */
  answered: boolean;
  sentences: BriefStatementDto[];
  sources: BriefSourceDto[];
}

export interface IncidentBriefDto {
  incidentId: string;
  basedOnVersion: RevisionString;
  basedOnTimelineCount: number;
  omittedTimelineEntries: number;
  generatedAt: string;
  provider: string;
  model: string;
  /** No model wrote it: the offline fake provider. */
  simulated: boolean;
  fromCache: boolean;
  whatHappened: BriefStatementDto[];
  currentState: BriefStatementDto[];
  openQuestions: BriefStatementDto[];
  suggestedChecks: BriefStatementDto[];
  sources: BriefSourceDto[];
}
