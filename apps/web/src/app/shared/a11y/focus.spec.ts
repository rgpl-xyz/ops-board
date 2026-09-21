import { ChangeDetectionStrategy, Component, inject, Injector } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';

import { focusAfterRender } from './focus';

@Component({
  selector: 'ob-focus-host',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: '<button type="button" id="target">Target</button>',
})
class FocusHost {
  readonly injector = inject(Injector);
}

describe('focusAfterRender', () => {
  it('focuses a connected target after the next render', async () => {
    await TestBed.configureTestingModule({
      imports: [FocusHost],
    }).compileComponents();
    const fixture = TestBed.createComponent(FocusHost);
    document.body.append(fixture.nativeElement);
    fixture.detectChanges();
    const target = fixture.nativeElement.querySelector(
      '#target',
    ) as HTMLButtonElement;

    focusAfterRender(fixture.componentInstance.injector, () => target);
    await TestBed.tick();

    expect(document.activeElement).toBe(target);

    fixture.destroy();
    fixture.nativeElement.remove();
  });

  it('leaves focus alone for a missing or disconnected target', async () => {
    await TestBed.configureTestingModule({
      imports: [FocusHost],
    }).compileComponents();
    const fixture = TestBed.createComponent(FocusHost);
    document.body.append(fixture.nativeElement);
    fixture.detectChanges();

    const outside = document.createElement('button');
    outside.type = 'button';
    document.body.append(outside);
    outside.focus();

    const detached = document.createElement('button');
    focusAfterRender(fixture.componentInstance.injector, () => detached);
    focusAfterRender(fixture.componentInstance.injector, () => null);
    await TestBed.tick();

    expect(document.activeElement).toBe(outside);

    outside.remove();
    fixture.destroy();
    fixture.nativeElement.remove();
  });
});
