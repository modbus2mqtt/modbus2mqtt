import { Injectable, inject } from '@angular/core'
import { HttpRequest, HttpHandler, HttpEvent, HttpInterceptor, HttpErrorResponse } from '@angular/common/http'
import { Observable, catchError, throwError } from 'rxjs'
import { AuthService } from '../app/services/auth.service'

@Injectable()
export class AuthHeaderInterceptor implements HttpInterceptor {
  private auth = inject(AuthService)

  intercept(request: HttpRequest<any>, next: HttpHandler): Observable<HttpEvent<any>> {
    // Send session cookie with every request so OIDC-authenticated users are recognised
    const authReq = request.clone({ withCredentials: true })

    return next.handle(authReq).pipe(
      catchError((error: HttpErrorResponse) => {
        if (error.status === 401 && this.auth.isOidcEnabled) {
          this.auth.login()
        }
        return throwError(() => error)
      })
    )
  }
}
