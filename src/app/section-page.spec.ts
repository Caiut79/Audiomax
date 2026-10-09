import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { of } from 'rxjs';

import { AudiomaxDataService } from './audiomax-data.service';
import { SectionPageComponent } from './section-page';

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
});
