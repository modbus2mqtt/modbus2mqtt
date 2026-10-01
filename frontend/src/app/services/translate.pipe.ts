import { Pipe, PipeTransform, inject } from '@angular/core'
import { TranslationService } from './translation.service'

/**
 * Usage: {{ 'bus.listTitle' | translate }}
 * Reads the active language signal, so templates re-render when the
 * user switches language (requirement for zoneless change detection).
 */
@Pipe({ name: 'translate', standalone: true })
export class TranslatePipe implements PipeTransform {
  private translation = inject(TranslationService)

  transform(key: string): string {
    return this.translation.t(key)
  }
}
