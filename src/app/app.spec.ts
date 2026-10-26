import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { App } from './app';
import { crmSections } from './crm-sections';
import { routes } from './app.routes';

describe('App', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [provideRouter(routes)],
    }).compileComponents();
  });

  it('should create the app', () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;
    expect(app).toBeTruthy();
  });

  it('should render the Audiomax shell', async () => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    await fixture.whenStable();
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('.brand-name')?.textContent).toContain('Audiomax');
    expect(compiled.querySelectorAll('.nav-section .nav-item').length).toBe(crmSections.length + 1);
  });

  it('organizza tutte le sezioni una sola volta per flusso operativo', () => {
    const fixture = TestBed.createComponent(App);
    const groups = (fixture.componentInstance as any).navGroups as {
      key: string; sections: { id: string }[];
    }[];
    const ids = groups.flatMap((group) => group.sections.map((section) => section.id));

    expect(new Set(ids).size).toBe(crmSections.length);
    expect(ids.length).toBe(crmSections.length);
    expect(groups.find((group) => group.key === 'logistics')?.sections.map((section) => section.id))
      .toEqual(['magazzino', 'ddt']);
    expect(groups.find((group) => group.key === 'management')?.sections.map((section) => section.id))
      .toEqual(['dipendenti', 'orari', 'spese', 'report']);
  });
});
