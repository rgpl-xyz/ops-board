import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  inject,
  Injector,
  signal,
  viewChild,
} from '@angular/core';

/** Dismissal restores the invoker; navigation deliberately suppresses restoration. */
export type PaletteCloseReason = 'dismiss' | 'navigate';

@Component({
  selector: 'ob-command-palette',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './command-palette.component.html',
  styleUrl: './command-palette.component.scss',
})
export class CommandPaletteComponent {
  private readonly injector = inject(Injector);

  private readonly dialogRef =
    viewChild.required<ElementRef<HTMLDialogElement>>('dialog');
  private readonly searchRef =
    viewChild.required<ElementRef<HTMLInputElement>>('search');

  protected readonly open = signal(false);
  protected readonly rawQuery = signal('');

  private invoker: HTMLElement | null = null;
  private closingForNavigation = false;

  /** Read by the shell shortcut to decide between opening and refocusing. */
  get isOpen(): boolean {
    return this.open();
  }

  /**
   * Opens the palette and focuses search. When already open the original
   * invoker is retained and only the search field is refocused.
   */
  openFrom(invoker?: HTMLElement | null): void {
    if (this.open()) {
      this.searchRef().nativeElement.focus();
      return;
    }

    this.invoker = invoker ?? this.activeElement();
    this.closingForNavigation = false;

    const dialog = this.dialogRef().nativeElement;
    if (!dialog.open) {
      dialog.showModal();
    }
    this.open.set(true);

    afterNextRender(() => this.searchRef().nativeElement.focus(), {
      injector: this.injector,
    });
  }

  close(reason: PaletteCloseReason = 'dismiss'): void {
    this.closingForNavigation = reason === 'navigate';

    const dialog = this.dialogRef().nativeElement;
    if (dialog.open) {
      dialog.close();
    }
    this.open.set(false);

    const invoker = this.invoker;
    this.invoker = null;
    if (this.closingForNavigation) {
      return;
    }

    if (invoker && invoker.isConnected && !this.isDisabled(invoker)) {
      afterNextRender(() => invoker.focus(), { injector: this.injector });
    }
  }

  protected onCancel(event: Event): void {
    event.preventDefault();
    this.close('dismiss');
  }

  /** Keeps local state truthful if the dialog is closed outside close(). */
  protected onDialogClose(): void {
    this.open.set(false);
  }

  protected onQueryInput(event: Event): void {
    this.rawQuery.set((event.target as HTMLInputElement).value);
  }

  private activeElement(): HTMLElement | null {
    return document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
  }

  private isDisabled(element: HTMLElement): boolean {
    return 'disabled' in element && element.disabled === true;
  }
}
