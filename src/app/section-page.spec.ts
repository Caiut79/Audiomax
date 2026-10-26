import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { of } from 'rxjs';

import { AudiomaxDataService } from './audiomax-data.service';
import { SectionPageComponent } from './section-page';
import { UiDialogDirective } from './ui-dialog.directive';

describe('SectionPageComponent Form Pattern', () => {
  beforeEach(async () => {
    localStorage.clear();

    await TestBed.configureTestingModule({
      imports: [SectionPageComponent],
      providers: [
        AudiomaxDataService,
        provideRouter([]),
        {
          provide: ActivatedRoute,
          useValue: {
            data: of({ sectionId: 'clienti' }),
            queryParamMap: of(convertToParamMap({})),
            snapshot: {
              data: { sectionId: 'clienti' },
            },
          },
        },
      ],
    }).compileComponents();
  });

  it('mostra messaggi chiari per i campi obbligatori', () => {
    const fixture = TestBed.createComponent(SectionPageComponent);
    const component = fixture.componentInstance as any;

    component.clientForm.controls.name.markAsTouched();
    component.clientForm.controls.name.setValue('');

    expect(component.hasFieldError(component.clientForm, 'name')).toBe(true);
    expect(component.fieldError(component.clientForm, 'name', 'Nome')).toBe('Nome obbligatorio.');
  });

  it('salva automaticamente la bozza del cliente in localStorage', () => {
    const fixture = TestBed.createComponent(SectionPageComponent);
    const component = fixture.componentInstance as any;

    component.clientForm.patchValue({
      name: 'Cliente Test Draft',
      email: 'draft@example.com',
    });

    const saved = localStorage.getItem('audiomax-form-draft:client');
    expect(saved).toContain('Cliente Test Draft');
    expect(component.hasFormDraft('client')).toBe(true);
  });

  it('ripristina una bozza quando si apre la maschera cliente', () => {
    localStorage.setItem(
      'audiomax-form-draft:client',
      JSON.stringify({
        savedAt: new Date().toISOString(),
        value: {
          name: 'Cliente Ripristinato',
          phone: '',
          email: 'restore@example.com',
          city: '',
          address: '',
          segment: '',
          preferredContact: 'email',
          favoriteBrands: '',
          notes: '',
          lastContact: '',
          status: 'lead',
        },
      }),
    );

    const fixture = TestBed.createComponent(SectionPageComponent);
    const component = fixture.componentInstance as any;

    component.openClientModal();

    expect(component.clientForm.controls.name.value).toBe('Cliente Ripristinato');
    expect(component.clientForm.controls.email.value).toBe('restore@example.com');
  });

  it('mantiene quattro destinazioni rapide senza eliminare funzioni del portale', () => {
    const fixture = TestBed.createComponent(SectionPageComponent);
    const component = fixture.componentInstance as any;

    expect(component.epPrimaryTabs.map((tab: { id: string }) => tab.id)).toEqual([
      'dashboard', 'agenda', 'magazzino', 'comunicazioni',
    ]);
    expect(component.epTabs.map((tab: { id: string }) => tab.id)).toEqual([
      'dashboard', 'agenda', 'magazzino', 'comunicazioni', 'ddt', 'servizi', 'ordini',
    ]);
  });

  it('cambia sezione del portale chiudendo il menu e il dettaglio precedente', () => {
    const fixture = TestBed.createComponent(SectionPageComponent);
    const component = fixture.componentInstance as any;
    component.epNavDrawerOpen.set(true);
    component.epSelectedCommId.set('messaggio-aperto');

    component.epGotoTab('agenda');

    expect(component.epActiveTab()).toBe('agenda');
    expect(component.epCurrentTabLabel()).toBe('Agenda');
    expect(component.epSelectedCommId()).toBeNull();
    expect(component.epNavDrawerOpen()).toBe(false);
    component.epResetPortalView();
    expect(component.epActiveTab()).toBe('dashboard');
  });
});

@Component({
  imports: [UiDialogDirective],
  template: '<div class="ui-modal"><h2>Dati cliente</h2><button>Chiudi</button><input aria-label="Nome"></div>',
})
class DialogTestHost {}

describe('Popup condivisi', () => {
  it('assegna il nome accessibile e ripristina il focus alla chiusura', async () => {
    await TestBed.configureTestingModule({ imports: [DialogTestHost] }).compileComponents();
    const trigger = document.createElement('button');
    document.body.appendChild(trigger);
    trigger.focus();
    const fixture = TestBed.createComponent(DialogTestHost);
    fixture.detectChanges();
    await fixture.whenStable();

    const dialog = fixture.nativeElement.querySelector('.ui-modal') as HTMLElement;
    const title = dialog.querySelector('h2') as HTMLElement;
    expect(dialog.getAttribute('role')).toBe('dialog');
    expect(dialog.getAttribute('aria-labelledby')).toBe(title.id);
    expect(document.activeElement).toBe(dialog);

    fixture.destroy();
    expect(document.activeElement).toBe(trigger);
    trigger.remove();
  });

  it('mantiene la navigazione Tab nel popup saltando i controlli disabilitati', async () => {
    await TestBed.configureTestingModule({ imports: [DialogTestHost] }).compileComponents();
    const fixture = TestBed.createComponent(DialogTestHost);
    fixture.detectChanges();
    await fixture.whenStable();
    const dialog = fixture.nativeElement.querySelector('.ui-modal') as HTMLElement;
    const first = dialog.querySelector('button') as HTMLButtonElement;
    const last = dialog.querySelector('input') as HTMLInputElement;
    // Il runner DOM non esegue layout: forniamo soltanto la visibilita' geometrica.
    first.getClientRects = () => [{ width: 44, height: 44 }] as unknown as DOMRectList;
    last.getClientRects = () => [{ width: 120, height: 44 }] as unknown as DOMRectList;
    last.focus();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }));
    expect(document.activeElement).toBe(first);
    first.disabled = true;
    dialog.focus();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }));
    expect(document.activeElement).toBe(last);
    fixture.destroy();
  });
});
