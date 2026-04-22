import { Injectable, inject } from '@angular/core'
import { ActivatedRouteSnapshot } from '@angular/router'
import { ApiService } from './api-service'
import { Observable, map } from 'rxjs'
import { AuthService } from './auth.service'

@Injectable({
  providedIn: 'root',
})
export class AuthGuardService {
  private auth = inject(AuthService)
  constructor(public api: ApiService) {}

  canActivate(_route: ActivatedRouteSnapshot): Observable<boolean> {
    return this.api.getUserAuthenticationStatus().pipe(
      map((userAuthStatus) => {
        // HA mode: no user auth required
        if (userAuthStatus.hassiotoken) return true

        // OIDC enabled: require authenticated session
        if (userAuthStatus.oidcEnabled) {
          if (!userAuthStatus.authenticated) {
            this.auth.login()
            return false
          }
          return true
        }

        // Open-access default (neither HA nor OIDC)
        return true
      })
    )
  }
}
