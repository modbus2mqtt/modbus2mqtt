import {
  Converters,
  FileLocation,
  IdentifiedStates,
  ImodbusEntity,
  ModbusRegisterType,
  SPECIFICATION_VERSION,
  SpecificationFileUsage,
} from '../../src/shared/specification/index.js'
import { IfileSpecification } from '../../src/specification/index.js'

/** Text entity with two holding registers spelling 'ABCD' */
export const entText: ImodbusEntity = {
  id: 2,
  mqttname: 'mqtt',
  modbusAddress: 5,
  registerType: ModbusRegisterType.HoldingRegister,
  readonly: true,
  modbusValue: [(65 << 8) | 66, (67 << 8) | 68],
  mqttValue: '',
  identified: IdentifiedStates.unknown,
  converterParameters: { stringlength: 10 },
  converter: 'text',
}

/**
 * Well-formed specification with number/select entities, i18n, files and testdata.
 * Tests should structuredClone() before mutating.
 */
export const specFixture: IfileSpecification = {
  entities: [
    {
      id: 1,
      mqttname: 'mqtt',
      converter: 'number' as Converters,
      modbusAddress: 3,
      registerType: ModbusRegisterType.HoldingRegister,
      readonly: true,
      icon: '',
      converterParameters: { multiplier: 0.1, offset: 0, uom: 'cm', identification: { min: 0, max: 200 } },
    },
    {
      id: 2,
      mqttname: 'mqtt2',
      converter: 'select' as Converters,
      modbusAddress: 4,
      registerType: ModbusRegisterType.HoldingRegister,
      readonly: true,
      icon: '',
      converterParameters: { optionModbusValues: [1, 2, 3] },
    },
    {
      id: 3,
      mqttname: 'mqtt3',
      converter: 'select' as Converters,
      modbusAddress: 5,
      registerType: ModbusRegisterType.HoldingRegister,
      readonly: false,
      icon: '',
      converterParameters: { optionModbusValues: [0, 1, 2, 3] },
    },
  ],
  status: 2,
  manufacturer: 'unknown',
  model: 'QDY30A',
  filename: 'waterleveltransmitter_validate',
  i18n: [
    {
      lang: 'en',
      texts: [
        { textId: 'name', text: 'name' },
        { textId: 'e1', text: 'e1' },
        { textId: 'e2', text: 'e2' },
        { textId: 'e3', text: 'e3' },
        { textId: 'e1o.1', text: 'ON' },
        { textId: 'e1o.0', text: 'OFF' },
        { textId: 'e1o.2', text: 'test' },
      ],
    },
  ],
  files: [
    { url: 'test', usage: SpecificationFileUsage.documentation, fileLocation: FileLocation.Local },
    { url: 'test1', usage: SpecificationFileUsage.img, fileLocation: FileLocation.Local },
  ],
  version: SPECIFICATION_VERSION,
  testdata: {
    holdingRegisters: [
      { address: 3, value: 1 },
      { address: 4, value: 1 },
      { address: 5, value: 1 },
      {
        address: 100,
        error: 'No data available',
      },
    ],
  },
}
