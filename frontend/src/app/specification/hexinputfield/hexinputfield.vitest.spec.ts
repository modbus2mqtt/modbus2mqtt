import { describe, it, expect } from 'vitest'
import { ComponentFixture, TestBed } from '@angular/core/testing'
import { HexinputfieldComponent } from './hexinputfield.test.component'
import { ensureAngularTesting } from '../../../test-setup'

ensureAngularTesting()

function typeAndBlur(input: HTMLInputElement, value: string, fixture: ComponentFixture<any>): void {
  input.value = ''
  input.dispatchEvent(new Event('input'))
  input.value = value
  input.dispatchEvent(new Event('input'))
  input.dispatchEvent(new Event('blur'))
  fixture.detectChanges()
}

describe('Hexinputfield Component tests (vitest)', () => {
  async function mount(
    startValue: number,
    displayHex: boolean
  ): Promise<{
    fixture: ComponentFixture<HexinputfieldComponent>
    input: HTMLInputElement
  }> {
    await TestBed.configureTestingModule({
      imports: [HexinputfieldComponent],
    }).compileComponents()

    const fixture = TestBed.createComponent(HexinputfieldComponent)
    fixture.componentInstance.startValue = startValue
    fixture.componentInstance.displayHex = displayHex
    fixture.detectChanges()

    const input = fixture.nativeElement.querySelector('input[formControlName="testHex"]') as HTMLInputElement
    return { fixture, input }
  }

  it('Show decimal', async () => {
    const { fixture, input } = await mount(0x1234, false)
    expect(input.value).toBe('4660')

    typeAndBlur(input, '1234', fixture)
    expect(input.value).toBe('1234')

    typeAndBlur(input, '0x1234', fixture)
    expect(input.value).toBe('4660')
  })

  it('Show Hex', async () => {
    const { fixture, input } = await mount(0x1234, true)
    expect(input.value).toBe('0x1234')

    typeAndBlur(input, '4660', fixture)
    expect(input.value).toBe('0x1234')

    typeAndBlur(input, '0x1234', fixture)
    expect(input.value).toBe('0x1234')
  })
})
