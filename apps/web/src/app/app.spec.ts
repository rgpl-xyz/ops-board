import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import {
  provideTanStackQuery,
  QueryClient,
} from '@tanstack/angular-query-experimental';
import { describe, expect, it } from 'vitest';

import { App } from './app';

describe('App', () => {
  it('should create the app', async () => {
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [
        provideRouter([]),
        provideTanStackQuery(new QueryClient()),
      ],
    }).compileComponents();

    const fixture = TestBed.createComponent(App);
    expect(fixture.componentInstance).toBeTruthy();
  });
});
