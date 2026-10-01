import { Component, computed, inject, signal } from '@angular/core'
import { RouterLink, RouterLinkActive } from '@angular/router'
import { CommonModule } from '@angular/common'
import { MatIcon } from '@angular/material/icon'
import { MatTooltip } from '@angular/material/tooltip'
import { MatFormFieldModule } from '@angular/material/form-field'
import { MatSelectModule } from '@angular/material/select'
import { MatMenuModule } from '@angular/material/menu'
import { AuthService } from '../services/auth.service'
import { TranslationService } from '../services/translation.service'

function currentTheme(): string {
  try {
    const saved = localStorage.getItem('m2m-theme')
    if (saved === 'light' || saved === 'dark') return saved
  } catch {
    /* ignore */
  }
  return 'dark'
}

@Component({
  selector: 'app-header',
  templateUrl: './header.component.html',
  styleUrls: ['./header.component.css'],
  imports: [CommonModule, RouterLink, RouterLinkActive, MatIcon, MatTooltip, MatFormFieldModule, MatSelectModule, MatMenuModule],
})
export class HeaderComponent {
  auth = inject(AuthService)
  private translation = inject(TranslationService)

  theme = currentTheme()
  t = (key: string) => this.translation.map()[key] ?? key
  languages = TranslationService.SUPPORTED.map((c) => ({ code: c, label: c.toUpperCase() }))

  /** Plain string for select [value]; the signal access keeps the template
      reactive so it re-renders on switch (zoneless change detection). */
  get currentLang(): string {
    this.translation.language() // track signal
    return this.translation.language()
  }

  toggleTheme(): void {
    this.theme = this.theme === 'dark' ? 'light' : 'dark'
    document.documentElement.dataset['theme'] = this.theme
    try {
      localStorage.setItem('m2m-theme', this.theme)
    } catch {
      /* ignore */
    }
  }

  setLanguage(lang: string): void {
    this.translation.setLanguage(lang as any)
  }
}
