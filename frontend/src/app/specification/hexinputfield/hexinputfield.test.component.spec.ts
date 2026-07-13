import { FormBuilder } from '@angular/forms'
import { describe, it, expect } from 'vitest'

import { HexinputfieldComponent } from './hexinputfield.test.component'
import { HexFormaterDirective } from './hexinputfield'

describe('HexinputfieldComponent (vitest)', () => {
  it('shows decimal values when displayHex is false', () => {
    const component = new HexinputfieldComponent(new FormBuilder())
    component.startValue = 0x1234
    component.displayHex = false
    component.ngOnInit()

    expect(component.formGroup.get('testHex')!.value).toBe('4660')
    expect(HexFormaterDirective.convertHexInput('1234')).toBe(1234)
    expect(HexFormaterDirective.convertHexInput('0x1234')).toBe(0x1234)
  })

  it('shows hex values when displayHex is true', () => {
    const component = new HexinputfieldComponent(new FormBuilder())
    component.startValue = 0x1234
    component.displayHex = true
    component.ngOnInit()

    expect(component.formGroup.get('testHex')!.value).toBe('0x1234')
    expect(HexFormaterDirective.convertNumberToInput(0x1234, true)).toBe('0x1234')
  })

  it('formats value on focus/blur', () => {
    const input = { value: '0x1234' }
    const directive = new HexFormaterDirective({ nativeElement: input } as any)
    directive.displayHex = false
    directive.onFocus(input.value)

    expect(input.value).toBe('4660')
  })
})
