/// <reference types="@angular/localize" />

import { HTTP_INTERCEPTORS, provideHttpClient, withInterceptorsFromDi } from '@angular/common/http'
import { bootstrapApplication } from '@angular/platform-browser'
import { provideRouter, withComponentInputBinding } from '@angular/router'
import { MAT_FORM_FIELD_DEFAULT_OPTIONS } from '@angular/material/form-field'
import { AppComponent } from './app/app.component'
import { AuthGuardService } from './app/services/auth-guard.service'
import { AuthHeaderInterceptor } from './interceptors/auth-header.interceptor'
import { APP_ROUTES } from './app/app-routing.module'
import { provideAnimations } from '@angular/platform-browser/animations'
import { APP_INITIALIZER, inject, provideZonelessChangeDetection } from '@angular/core'
import { AuthService } from './app/services/auth.service'

function initializeAuth(): () => Promise<void> {
  const auth = inject(AuthService)
  return () => auth.loadAuthConfig()
}

bootstrapApplication(AppComponent, {
  providers: [
    {
      provide: MAT_FORM_FIELD_DEFAULT_OPTIONS,
      useValue: { appearance: 'fill' },
    },
    provideHttpClient(withInterceptorsFromDi()),
    provideRouter(APP_ROUTES, withComponentInputBinding()),
    {
      provide: AuthGuardService,
    },
    {
      provide: HTTP_INTERCEPTORS,
      useClass: AuthHeaderInterceptor,
      multi: true,
    },
    {
      provide: APP_INITIALIZER,
      useFactory: initializeAuth,
      multi: true,
    },
    provideZonelessChangeDetection(),
    provideAnimations(),
  ],
})

/**  Copyright 2020 Google LLC. All Rights Reserved.
    Use of this source code is governed by an MIT-style license that
    can be found in the LICENSE file at http://angular.io/license */
