import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  inject,
  input,
  signal,
  viewChild,
} from '@angular/core';

/** How long a resting pointer waits before opening, and how long it may stray before closing. */
const OPEN_DELAY_MS = 300;
const CLOSE_DELAY_MS = 200;
/** Space between the button and the card, and between the card and the window edge. */
const GAP_PX = 6;
const EDGE_PX = 16;

let nextId = 0;

/**
 * A button that shows more in a card beside it. Resting the mouse on the
 * button opens the card and leaving both closes it, so the pointer can cross
 * into the card and scroll it. A click, tap, Enter or Space keeps it open
 * until Escape or a click elsewhere, and the card follows the button in tab
 * order. As a popover it sits above the page's scrolling regions, and opening
 * one closes any other.
 */
@Component({
  selector: 'ob-hover-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <button
      #trigger
      type="button"
      class="link-button"
      [attr.popovertarget]="panelId"
      [attr.aria-label]="ariaLabel()"
      (pointerenter)="onPointerEnter($event)"
      (pointerleave)="onPointerLeave($event)"
      (click)="onClick($event)"
    >
      {{ label() }}
    </button>
    <div
      #panel
      popover="auto"
      role="dialog"
      class="card"
      [id]="panelId"
      [attr.aria-labelledby]="panelId + '-title'"
      (pointerenter)="onPointerEnter($event)"
      (pointerleave)="onPointerLeave($event)"
      (beforetoggle)="onBeforeToggle($event)"
    >
      <p class="card__title" [id]="panelId + '-title'">{{ heading() }}</p>
      <div class="card__body" tabindex="0">
        <ng-content />
      </div>
    </div>
  `,
  styles: `
    /* Placed beside its button by place(), not by the popover's centring. */
    .card {
      position: fixed;
      inset: auto;
      margin: 0;
      padding: 0;
      width: max-content;
      max-width: min(36rem, calc(100vw - 2rem));
      max-height: min(24rem, var(--card-room, 100dvh));
      border: 1px solid var(--ob-rule-strong);
      border-radius: var(--ob-radius);
      background: var(--ob-surface);
      color: var(--ob-ink);
      box-shadow: 0 6px 24px rgb(0 0 0 / 18%);
    }
    .card:popover-open {
      display: flex;
      flex-direction: column;
    }
    .card__title {
      margin: 0;
      padding: 0.65rem 0.9rem 0.35rem;
      font-family: var(--ob-font-mono);
      font-size: 0.72rem;
      font-weight: 500;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: var(--ob-muted);
    }
    .card__body {
      min-height: 0;
      overflow-y: auto;
      overscroll-behavior: contain;
      padding: 0 0.9rem 0.75rem;
    }
    .card__body:focus-visible {
      outline-offset: -2px;
    }
  `,
})
export class HoverCardComponent {
  readonly label = input.required<string>();
  readonly heading = input.required<string>();
  /** A fuller name for the button, when its visible label leans on its surroundings. */
  readonly ariaLabel = input<string | null>(null);

  readonly isOpen = signal(false);
  protected readonly panelId = `ob-hover-card-${nextId++}`;

  private readonly trigger =
    viewChild.required<ElementRef<HTMLButtonElement>>('trigger');
  private readonly panel = viewChild.required<ElementRef<HTMLElement>>('panel');

  private openTimer: ReturnType<typeof setTimeout> | null = null;
  private closeTimer: ReturnType<typeof setTimeout> | null = null;
  /** Opened by a resting pointer, so leaving closes it; a click keeps it open. */
  private openedByHover = false;

  /** Keeps the card beside its button while anything but the card scrolls. */
  private readonly follow = (event: Event): void => {
    const target = event.target;
    if (!(target instanceof Node && this.panel().nativeElement.contains(target))) {
      this.place();
    }
  };

  constructor() {
    inject(DestroyRef).onDestroy(() => {
      this.clearTimers();
      this.stopFollowing();
    });
  }

  protected onPointerEnter(event: PointerEvent): void {
    if (event.pointerType !== 'mouse') {
      return;
    }
    this.clearCloseTimer();
    if (this.isOpen() || this.openTimer !== null) {
      return;
    }
    this.openTimer = setTimeout(() => {
      this.openTimer = null;
      this.openedByHover = true;
      this.panel().nativeElement.showPopover({
        source: this.trigger().nativeElement,
      });
    }, OPEN_DELAY_MS);
  }

  protected onPointerLeave(event: PointerEvent): void {
    if (event.pointerType !== 'mouse') {
      return;
    }
    this.clearOpenTimer();
    if (!this.isOpen() || !this.openedByHover || this.closeTimer !== null) {
      return;
    }
    this.closeTimer = setTimeout(() => {
      this.closeTimer = null;
      this.panel().nativeElement.hidePopover();
    }, CLOSE_DELAY_MS);
  }

  /** A click on a card the pointer opened keeps it open instead of toggling it shut. */
  protected onClick(event: MouseEvent): void {
    this.clearTimers();
    if (this.isOpen() && this.openedByHover) {
      event.preventDefault();
      this.openedByHover = false;
    }
  }

  protected onBeforeToggle(event: Event): void {
    const opening = (event as ToggleEvent).newState === 'open';
    this.isOpen.set(opening);
    if (!opening) {
      this.openedByHover = false;
      this.clearTimers();
      this.stopFollowing();
      return;
    }
    // The card is shown once this event's task ends; place it before it paints.
    requestAnimationFrame(() => this.place());
    addEventListener('scroll', this.follow, { capture: true, passive: true });
    addEventListener('resize', this.follow, { passive: true });
  }

  /** Below the button, or above it when there is more room there, inside the window. */
  private place(): void {
    if (!this.isOpen()) {
      return;
    }
    const panel = this.panel().nativeElement;
    const anchor = this.trigger().nativeElement.getBoundingClientRect();
    const below = innerHeight - anchor.bottom - GAP_PX - EDGE_PX;
    const above = anchor.top - GAP_PX - EDGE_PX;

    panel.style.removeProperty('--card-room');
    const downward = panel.offsetHeight <= below || below >= above;
    panel.style.setProperty('--card-room', `${Math.max(downward ? below : above, 0)}px`);

    const { width, height } = panel.getBoundingClientRect();
    const left = Math.max(EDGE_PX, Math.min(anchor.left, innerWidth - EDGE_PX - width));
    panel.style.left = `${left}px`;
    panel.style.top = `${downward ? anchor.bottom + GAP_PX : anchor.top - GAP_PX - height}px`;
  }

  private stopFollowing(): void {
    removeEventListener('scroll', this.follow, { capture: true });
    removeEventListener('resize', this.follow);
  }

  private clearOpenTimer(): void {
    if (this.openTimer !== null) {
      clearTimeout(this.openTimer);
      this.openTimer = null;
    }
  }

  private clearCloseTimer(): void {
    if (this.closeTimer !== null) {
      clearTimeout(this.closeTimer);
      this.closeTimer = null;
    }
  }

  private clearTimers(): void {
    this.clearOpenTimer();
    this.clearCloseTimer();
  }
}
