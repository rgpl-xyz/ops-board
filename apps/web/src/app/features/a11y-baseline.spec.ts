import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';

import { CalloutComponent } from '../shared/ui/callout.component';
import { ConfirmDialogComponent } from '../shared/ui/confirm-dialog.component';
import { HealthBadgeComponent } from '../shared/ui/health-badge.component';
import { SeverityBadgeComponent } from '../shared/ui/severity-badge.component';

describe('Phase 4 baseline accessibility smoke', () => {
  it('keeps severity and health as text cues', async () => {
    await TestBed.configureTestingModule({
      imports: [SeverityBadgeComponent, HealthBadgeComponent],
    }).compileComponents();

    const sev = TestBed.createComponent(SeverityBadgeComponent);
    sev.componentRef.setInput('severity', 'High');
    await sev.whenStable();
    expect(sev.nativeElement.textContent).toContain('High');

    const health = TestBed.createComponent(HealthBadgeComponent);
    health.componentRef.setInput('health', 'Degraded');
    await health.whenStable();
    expect(health.nativeElement.textContent).toContain('Degraded');
  });

  it('keeps loading quiet while preserving explicit conflict alerts', async () => {
    await TestBed.configureTestingModule({
      imports: [CalloutComponent],
    }).compileComponents();
    const conflict = TestBed.createComponent(CalloutComponent);
    conflict.componentRef.setInput('variant', 'conflict');
    conflict.componentRef.setInput('semantic', 'alert');
    await conflict.whenStable();
    expect(
      conflict.nativeElement.querySelector('[role="alert"]'),
    ).toBeTruthy();

    const loading = TestBed.createComponent(CalloutComponent);
    loading.componentRef.setInput('variant', 'loading');
    await loading.whenStable();
    expect(loading.nativeElement.querySelector('[role]')).toBeNull();
  });

  it('renders labeled confirm controls in the dialog template', async () => {
    await TestBed.configureTestingModule({
      imports: [ConfirmDialogComponent],
    }).compileComponents();
    const fixture = TestBed.createComponent(ConfirmDialogComponent);
    fixture.componentRef.setInput('title', 'Resolve?');
    fixture.componentRef.setInput('body', 'Confirm resolution.');
    fixture.componentRef.setInput('confirmLabel', 'Confirm resolve');
    fixture.detectChanges();
    const confirm = fixture.nativeElement.querySelector(
      'button[value="confirm"]',
    ) as HTMLButtonElement;
    const cancel = fixture.nativeElement.querySelector(
      'button[value="cancel"]',
    ) as HTMLButtonElement;
    expect(confirm?.textContent).toContain('Confirm resolve');
    expect(cancel?.textContent).toContain('Cancel');
    expect(fixture.nativeElement.querySelector('h2')?.textContent).toContain(
      'Resolve?',
    );
  });
});
