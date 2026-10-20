import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  Injector,
  input,
  runInInjectionContext,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { injectQuery } from '@tanstack/angular-query-experimental';

import {
  relatedIncidentsQuery,
  type RelatedIncidentDto,
} from '../../../data-access';
import { TimestampPipe } from '../../../shared/pipes/timestamp.pipe';
import { CalloutComponent } from '../../../shared/ui/callout.component';
import { SeverityBadgeComponent } from '../../../shared/ui/severity-badge.component';
import { StatusBadgeComponent } from '../../../shared/ui/status-badge.component';

const WORDS = new Intl.ListFormat('en', { type: 'conjunction' });

/** Why the server picked an incident, as one sentence. */
function reason(item: RelatedIncidentDto): string {
  const words = item.sharedWords.length
    ? `both titles mention ${WORDS.format(item.sharedWords.map((w) => `“${w}”`))}`
    : '';
  const kinship = item.sameService
    ? 'Same service'
    : item.sameTeam
      ? `Same team (${item.teamName})`
      : '';
  if (kinship && words) {
    return `${kinship}, and ${words}.`;
  }
  const only = kinship || words;
  return `${only.charAt(0).toUpperCase()}${only.slice(1)}.`;
}

/**
 * Other incidents with something in common with this one, strongest first,
 * each with the reason the server gave for it. The server picks them by fixed
 * rules, so the list says so rather than passing for AI.
 */
@Component({
  selector: 'ob-related-incidents',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CalloutComponent, RouterLink, SeverityBadgeComponent, StatusBadgeComponent, TimestampPipe],
  template: `
    <p class="related__legend">
      Picked by fixed rules, not AI: the same service, or words both titles share. Closest matches first.
    </p>
    @if (related.isPending()) {
      <ob-callout variant="loading">Loading related incidents…</ob-callout>
    } @else if (related.isError()) {
      <ob-callout variant="error" semantic="alert">Could not load related incidents.</ob-callout>
    } @else if (items().length === 0) {
      <ob-callout variant="empty">
        No related incidents. None share this incident's service, or enough words in its title.
      </ob-callout>
    } @else {
      <ol class="related">
        @for (item of items(); track item.id) {
          <li>
            <a class="related__title" [routerLink]="['/incidents', item.id]">{{ item.title }}</a>
            <div class="related__meta">
              <ob-severity-badge [severity]="item.severity" [muted]="item.status === 'Resolved'" />
              <ob-status-badge [status]="item.status" />
              <span>{{ item.serviceName }}</span>
              <time [attr.datetime]="item.createdAt">{{ item.createdAt | obTimestamp }}</time>
            </div>
            <p class="related__why">{{ item.reason }}</p>
          </li>
        }
      </ol>
    }
  `,
  styles: `
    .related__legend {
      margin: 0 0 0.75rem;
      color: var(--ob-muted);
      font-size: 0.8rem;
    }
    .related {
      list-style: none;
      margin: 0;
      padding: 0;
    }
    .related li {
      padding: 0.6rem 0;
      border-bottom: 1px solid var(--ob-rule);
    }
    .related li:first-child {
      padding-top: 0;
    }
    .related__title {
      font-size: 0.92rem;
      font-weight: 500;
    }
    .related__meta {
      display: flex;
      flex-wrap: wrap;
      align-items: baseline;
      gap: 0.2rem 0.75rem;
      margin-top: 0.2rem;
      font-family: var(--ob-font-mono);
      font-size: 0.72rem;
      color: var(--ob-muted);
    }
    .related__why {
      margin: 0.3rem 0 0;
      font-size: 0.85rem;
      line-height: 1.45;
      color: var(--ob-ink-2);
    }
  `,
})
export class RelatedIncidentsComponent {
  readonly incidentId = input.required<string>();

  private readonly injector = inject(Injector);
  private readonly options = computed(() => {
    const id = this.incidentId();
    return runInInjectionContext(this.injector, () => relatedIncidentsQuery(id));
  });
  protected readonly related = injectQuery(() => this.options());

  protected readonly items = computed(() =>
    (this.related.data()?.items ?? []).map((item) => ({ ...item, reason: reason(item) })),
  );
}
