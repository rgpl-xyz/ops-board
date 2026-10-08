import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';

import { ResizeToFitDirective } from './resize-to-fit.directive';

@Component({
  imports: [ResizeToFitDirective],
  template: `
    <div class="region" style="overflow-y: auto">
      <textarea obResizeToFit></textarea>
    </div>
  `,
})
class Host {}

/**
 * jsdom lays nothing out, so model it: a region `visible` pixels tall holding
 * `other` pixels of content and a 100px box with `slack` pixels free beside
 * it, which the box can take before it pushes the content down.
 */
function layOut(
  region: HTMLElement,
  box: HTMLTextAreaElement,
  { visible = 500, other = 300, slack = 40 } = {},
): void {
  const boxHeight = (): number => (box.style.height ? parseFloat(box.style.height) : 100);
  Object.defineProperty(box, 'offsetHeight', { configurable: true, get: boxHeight });
  Object.defineProperty(region, 'clientHeight', { configurable: true, value: visible });
  Object.defineProperty(region, 'scrollHeight', {
    configurable: true,
    get: () => Math.max(visible, other + 100 + Math.max(0, boxHeight() - 100 - slack)),
  });
}

async function render() {
  await TestBed.configureTestingModule({ imports: [Host] }).compileComponents();
  const fixture = TestBed.createComponent(Host);
  fixture.detectChanges();
  const root = fixture.nativeElement as HTMLElement;
  return {
    region: root.querySelector('.region') as HTMLElement,
    box: root.querySelector('textarea') as HTMLTextAreaElement,
  };
}

describe('ResizeToFitDirective', () => {
  it('lets a box grow into the free space and its slack, and no further', async () => {
    const { region, box } = await render();
    layOut(region, box);

    box.dispatchEvent(new Event('pointerenter'));

    // 100px free below the content and 40px of slack: 100 + 140.
    expect(box.style.getPropertyValue('--ob-resize-max')).toBe('240px');
    expect(box.style.height).toBe('');
    expect(box.style.maxHeight).toBe('');
  });

  it('leaves only the line limit where the region scrolls already', async () => {
    const { region, box } = await render();
    layOut(region, box, { other: 600 });
    box.style.setProperty('--ob-resize-max', '999px');

    box.dispatchEvent(new Event('pointerenter'));

    expect(box.style.getPropertyValue('--ob-resize-max')).toBe('');
  });

  it('pins a box dragged past its limit to the height it shows', async () => {
    const { region, box } = await render();
    layOut(region, box, { other: 600 });
    // The browser keeps the full drag inline; max-height holds the box at 104px.
    box.style.height = '676px';
    Object.defineProperty(box, 'offsetHeight', { configurable: true, value: 104 });

    box.dispatchEvent(new Event('pointerenter'));

    expect(box.style.height).toBe('104px');
  });
});
