import { Injectable, inject } from '@angular/core'
import { HttpClient } from '@angular/common/http'
import { BehaviorSubject, firstValueFrom } from 'rxjs'
import { apiUri } from '@shared/server'

export interface AuthConfig {
  oidcEnabled: boolean
  authenticated: boolean
  user?: { name?: string; email?: string }
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private http = inject(HttpClient)
  private authConfig$ = new BehaviorSubject<AuthConfig>({
    oidcEnabled: false,
    authenticated: false,
  })

  async loadAuthConfig(): Promise<void> {
    try {
      const config = await firstValueFrom(this.http.get<AuthConfig>(apiUri.authConfig, { withCredentials: true }))
      this.authConfig$.next(config)
    } catch {
      this.authConfig$.next({ oidcEnabled: false, authenticated: false })
    }
  }

  get isOidcEnabled(): boolean {
    return this.authConfig$.value.oidcEnabled
  }

  get isAuthenticated(): boolean {
    return this.authConfig$.value.authenticated
  }

  get user(): AuthConfig['user'] {
    return this.authConfig$.value.user
  }

  login(): void {
    window.location.href = apiUri.authLogin
  }

  async logout(): Promise<void> {
    try {
      const result = await firstValueFrom(
        this.http.post<{ redirectUrl: string }>(apiUri.authLogout, {}, { withCredentials: true })
      )
      window.location.href = result.redirectUrl
    } catch {
      window.location.href = '/'
    }
  }
}
