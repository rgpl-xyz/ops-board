import { Directive, ElementRef, inject } from '@angular/core';

/** Far taller than any real text box, so the measuring stretch always overflows. */
const PROBE_PX = 10_000;

/**
 * A text box dragged taller stops where its scrolling region would start to
 * scroll, so resizing it never adds a page scrollbar. Whenever the pointer
 * comes over the box it measures the room afresh and hands it to the
 * stylesheet as --ob-resize-max, for the box's max-height to combine with its
 * own line limit. Where the region scrolls already, only the line limit applies.
 *
 * It measures on entry rather than on press: a box whose height changes while
 * the press is being handled never starts the browser's resize.
 */
@Directive({
  selector: 'textarea[obResizeToFit]',
  host: { '(pointerenter)': 'measureRoom()' },
})
export class ResizeToFitDirective {
  private readonly host = inject<ElementRef<HTMLTextAreaElement>>(ElementRef);

  protected measureRoom(): void {
    const box = this.host.nativeElement;
    const region = scrollRegion(box);
    // A drag past the limit leaves an inline height taller than the box shows.
    // Pin it to what shows, so changing the limit below cannot make it jump.
    const start = box.offsetHeight;
    if (box.style.height) {
      box.style.height = `${start}px`;
    }
    if (region.scrollHeight > region.clientHeight + 1) {
      box.style.removeProperty('--ob-resize-max');
      return;
    }

    // Stretch the box far past any real height and see how much of the stretch
    // the region cannot absorb. Undone in the same task, so nothing paints.
    const { height, maxHeight } = box.style;
    box.style.maxHeight = 'none';
    box.style.height = `${start + PROBE_PX}px`;
    const overflow = region.scrollHeight - region.clientHeight;
    box.style.height = height;
    box.style.maxHeight = maxHeight;

    const room = Math.max(0, PROBE_PX - overflow);
    box.style.setProperty('--ob-resize-max', `${start + room}px`);
  }
}

/** The nearest ancestor that scrolls vertically, or else the document. */
function scrollRegion(element: HTMLElement): HTMLElement {
  for (let node = element.parentElement; node; node = node.parentElement) {
    const { overflowY } = getComputedStyle(node);
    if (overflowY === 'auto' || overflowY === 'scroll') {
      return node;
    }
  }
  return (document.scrollingElement as HTMLElement | null) ?? document.documentElement;
}
