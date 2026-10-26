import { DOCUMENT } from '@angular/common';
import { afterNextRender, Directive, ElementRef, HostListener, inject, OnDestroy } from '@angular/core';

let titleSequence = 0;

/** Gestione comune del focus per i popup, senza modificare salvataggio e chiusura. */
@Directive({
  selector: '.ui-modal, .ep-modal-body, .ep-nav-drawer',
  host: { role: 'dialog', 'aria-modal': 'true', tabindex: '-1' },
})
export class UiDialogDirective implements OnDestroy {
  private static readonly dialogs: UiDialogDirective[] = [];
  private readonly element: HTMLElement = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  private readonly document = inject(DOCUMENT);
  private previousFocus: HTMLElement | null = null;

  constructor() {
    afterNextRender(() => {
      if (!this.element.isConnected) return;
      this.previousFocus = this.document.activeElement as HTMLElement | null;
      UiDialogDirective.dialogs.push(this);

      if (!this.element.hasAttribute('aria-label') && !this.element.hasAttribute('aria-labelledby')) {
        const title = this.element.querySelector<HTMLElement>('h1, h2, h3');
        if (title) {
          title.id ||= `ui-dialog-title-${++titleSequence}`;
          this.element.setAttribute('aria-labelledby', title.id);
        }
      }

      // Il titolo resta visibile e il focus iniziale non attiva la tastiera mobile.
      this.element.focus({ preventScroll: true });
    });
  }

  @HostListener('document:keydown', ['$event'])
  protected trapFocus(event: KeyboardEvent): void {
    const current = UiDialogDirective.dialogs.filter((dialog) => dialog.document === this.document).at(-1);
    if (current !== this) return;

    if (event.key === 'Escape') {
      // Riutilizza esclusivamente la chiusura gia' collegata allo sfondo del popup.
      const backdrop = this.element.parentElement?.closest<HTMLElement>('.ui-modal-overlay, .ep-modal-mask');
      if (backdrop) {
        event.preventDefault();
        event.stopPropagation();
        backdrop.click();
      }
      return;
    }

    if (event.key !== 'Tab') return;

    const controls = Array.from(this.element.querySelectorAll<HTMLElement>(
      'a[href], button, input:not([type="hidden"]), select, textarea, [tabindex]',
    )).filter((control) =>
      control.tabIndex >= 0 &&
      !control.matches(':disabled') &&
      !control.closest('[hidden], [inert], [aria-hidden="true"]') &&
      control.getClientRects().length > 0,
    );
    const first = controls[0];
    const last = controls.at(-1);
    const active = this.document.activeElement;

    if (!first || !last) {
      event.preventDefault();
      this.element.focus();
    } else if (!this.element.contains(active) || active === this.element) {
      event.preventDefault();
      (event.shiftKey ? last : first).focus();
    } else if (event.shiftKey && active === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    }
  }

  ngOnDestroy(): void {
    const index = UiDialogDirective.dialogs.indexOf(this);
    const wasTopmost = index === UiDialogDirective.dialogs.length - 1;
    if (index >= 0) UiDialogDirective.dialogs.splice(index, 1);
    if (wasTopmost && this.previousFocus?.isConnected) {
      this.previousFocus.focus({ preventScroll: true });
    }
  }
}
