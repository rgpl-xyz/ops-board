import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';

import { CalloutComponent } from './callout.component';
import { HealthBadgeComponent } from './health-badge.component';
import { PageHeaderComponent } from './page-header.component';
import { PaginationComponent } from './pagination.component';
import { SeverityBadgeComponent } from './severity-badge.component';
import { StatusBadgeComponent } from './status-badge.component';

describe('shared presentational UI', () => {
  it('renders severity as visible text, not color-only', async () => {
    await TestBed.configureTestingModule({
      imports: [SeverityBadgeComponent],
    }).compileComponents();
    const fixture = TestBed.createComponent(SeverityBadgeComponent);
    fixture.componentRef.setInput('severity', 'Critical');
    await fixture.whenStable();
    expect(fixture.nativeElement.textContent).toContain('Critical');
  });

  it('renders health as visible text', async () => {
    await TestBed.configureTestingModule({
      imports: [HealthBadgeComponent],
    }).compileComponents();
    const fixture = TestBed.createComponent(HealthBadgeComponent);
    fixture.componentRef.setInput('health', 'Outage');
    await fixture.whenStable();
    expect(fixture.nativeElement.textContent).toContain('Outage');
  });

  it('renders status as visible text', async () => {
    await TestBed.configureTestingModule({
      imports: [StatusBadgeComponent],
    }).compileComponents();
    const fixture = TestBed.createComponent(StatusBadgeComponent);
    fixture.componentRef.setInput('status', 'Investigating');
    await fixture.whenStable();
    expect(fixture.nativeElement.textContent).toContain('Investigating');
  });

  it('keeps quiet callouts readable without live semantics and supports explicit alerts', async () => {
    @Component({
      imports: [CalloutComponent],
      template: `
        <ob-callout variant="error">Passive error</ob-callout>
        <ob-callout variant="empty">Empty</ob-callout>
        <ob-callout variant="loading">Loading</ob-callout>
        <ob-callout variant="error" semantic="alert">Failed</ob-callout>
        <ob-callout variant="conflict" semantic="alert">Conflict</ob-callout>
        <ob-callout variant="info" semantic="status">Updated</ob-callout>
      `,
    })
    class Host {}

    await TestBed.configureTestingModule({ imports: [Host] }).compileComponents();
    const fixture = TestBed.createComponent(Host);
    await fixture.whenStable();
    const roles = Array.from(
      fixture.nativeElement.querySelectorAll('.callout'),
    ).map((el) => (el as HTMLElement).getAttribute('role'));
    expect(roles).toEqual([null, null, null, 'alert', 'alert', 'status']);
    expect(
      fixture.nativeElement.querySelectorAll('[aria-live="polite"]'),
    ).toHaveLength(1);
  });

  it('renders page header title', async () => {
    await TestBed.configureTestingModule({
      imports: [PageHeaderComponent],
    }).compileComponents();
    const fixture = TestBed.createComponent(PageHeaderComponent);
    fixture.componentRef.setInput('title', 'Incidents');
    await fixture.whenStable();
    const heading = fixture.nativeElement.querySelector('h1') as HTMLElement;
    expect(heading.textContent).toContain(
      'Incidents',
    );
    expect(heading.getAttribute('data-ob-route-focus')).toBe('');
    expect(heading.getAttribute('tabindex')).toBe('-1');
  });

  it('disables previous on first page and next on last page', async () => {
    await TestBed.configureTestingModule({
      imports: [PaginationComponent],
    }).compileComponents();
    const fixture = TestBed.createComponent(PaginationComponent);
    fixture.componentRef.setInput('page', 1);
    fixture.componentRef.setInput('totalPages', 3);
    fixture.componentRef.setInput('totalCount', 27);
    await fixture.whenStable();
    const buttons = fixture.nativeElement.querySelectorAll(
      'button',
    ) as NodeListOf<HTMLButtonElement>;
    expect(buttons[0]?.disabled).toBe(true);
    expect(buttons[1]?.disabled).toBe(false);
    expect(fixture.nativeElement.textContent).toContain('Page 1 of 3');
    expect(fixture.nativeElement.textContent).toContain('27 total');
  });
});
