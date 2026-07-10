import * as fs from 'fs'
import { join } from 'path'
import {
  FileLocation,
  IbaseSpecification,
  Imessage,
  ImodbusSpecification,
  Ispecification,
  MessageCategories,
  MessageTypes,
  SpecificationFileUsage,
  SpecificationStatus,
  getSpecificationI18nEntityName,
  getSpecificationI18nName,
} from '../shared/specification/index.js'
import { IfileSpecification } from './ifilespecification.js'
import { ConfigSpecification } from './configspec.js'
import { M2mGitHub } from './m2mgithub.js'
import { IpullRequest } from './m2mGithubValidate.js'
import { LogLevelEnum, Logger } from './log.js'
import { compareSpecifications } from './specDiff.js'
import { getMessageString, messages2Text } from './specMessages.js'
import { validateSpecification } from './specValidator.js'

const log = new Logger('m2mSpecification')

/** files referenced by the specification that exist locally, plus the spec json itself */
export function getSpecificationsFilesList(spec: IbaseSpecification, localDir: string): string[] {
  const files: string[] = []
  spec.files.forEach((file) => {
    const filePath = file.url.replace(/^\//g, '')
    if (file.fileLocation == FileLocation.Local && fs.existsSync(join(localDir, filePath))) files.push(filePath)
  })
  files.push(join('specifications', spec.filename + '.json'))
  return files
}

function generateAddedContributionMessage(spec: ImodbusSpecification): string {
  // First contribution:
  // Name of Specification(en)
  let message = `First contribution of ${getSpecificationI18nName(spec, 'en')}(${spec.filename}) \nEntities:\n`
  message = `${message}Languages: `
  spec.i18n.forEach((l) => {
    message = `${message} ${l.lang} `
  })
  message = `${message}\nEntities:\n`
  spec.entities.forEach((ent) => {
    message = `${message}\t${getSpecificationI18nEntityName(spec, 'en', ent.id)}\n`
  })
  message = `${message}\nImages:\n`
  spec.files.forEach((file) => {
    if (file.usage == SpecificationFileUsage.img) message = `${message}\t ${file.url}\n`
  })
  message = `${message}\nDocumentation:\n`
  spec.files.forEach((file) => {
    if (file.usage == SpecificationFileUsage.documentation) message = `${message}\t ${file.url}\n`
  })
  return message
}

function generateClonedContributionMessage(
  spec: IbaseSpecification,
  note: string | undefined,
  publicSpecification: IfileSpecification | undefined
): string {
  let rcmessage = ''
  if (publicSpecification) {
    rcmessage = rcmessage + 'Changes:\n'
    const messages = compareSpecifications(spec as Ispecification, publicSpecification)
    messages.forEach((message) => {
      rcmessage = rcmessage + getMessageString(spec, message) + '\n'
    })
    // TODO: a backward-compatibility check was planned here but never implemented

    if (note != undefined) rcmessage = rcmessage + '\n' + note
  }
  return rcmessage
}

export async function contribute(settings: Ispecification, note: string | undefined): Promise<number> {
  const language = ConfigSpecification.mqttdiscoverylanguage
  let messages: Imessage[] = []

  if (language == undefined) messages.push({ type: MessageTypes.noMqttDiscoveryLanguage, category: MessageCategories.configuration })
  else messages = validateSpecification(settings, language)
  const errors: string = messages2Text(settings as IbaseSpecification, messages)

  if (errors.length > 0) {
    throw new Error('Validation failed with errors: ' + errors)
  }

  if (errors.length == 0 && messages.length > 0 && (!note || note.length == 0))
    throw new Error('Validation failed with warning, but no note text available')
  const fileList = getSpecificationsFilesList(settings as IbaseSpecification, ConfigSpecification.getLocalDir())
  const spec = settings as IbaseSpecification
  let title = ''
  let message = ''
  switch (spec.status) {
    case SpecificationStatus.added: {
      title = 'Add specification '
      message = generateAddedContributionMessage(settings as ImodbusSpecification)
      break
    }
    case SpecificationStatus.cloned: {
      title = 'Update specification '
      const pub = (spec as unknown as { publicSpecification?: IfileSpecification }).publicSpecification
      message = generateClonedContributionMessage(spec, note, pub)
      break
    }
  }
  title = title + getSpecificationI18nName(spec, language!)
  if (!ConfigSpecification.githubPersonalToken || !ConfigSpecification.githubPersonalToken.length) {
    throw new Error('Github connection is not configured. Set Github Personal Acces Token in configuration UI first')
  }
  const github = new M2mGitHub(ConfigSpecification.githubPersonalToken, ConfigSpecification.getPublicDir())
  try {
    await github.init()
    await github.commitFiles(ConfigSpecification.getLocalDir(), spec.filename, fileList, title, message)
    const issue = await github.createPullrequest(title, message, spec.filename)
    new ConfigSpecification().changeContributionStatus(spec.filename, SpecificationStatus.contributed, issue)
    return issue
  } catch (e: unknown) {
    if (spec.status == SpecificationStatus.contributed)
      new ConfigSpecification().changeContributionStatus(spec.filename, SpecificationStatus.added)
    try {
      await github.deleteSpecBranch(spec.filename)
    } catch (e1: unknown) {
      log.log(LogLevelEnum.error, 'delete branch: ' + (e1 as Error).message)
    }
    throw e
  }
}

function throwCloseContributionError(msg: string): never {
  log.log(LogLevelEnum.error, msg)
  const e = new Error(msg) as Error & { step?: string }
  e.step = 'closeContribution'
  throw e
}

export async function closeContribution(spec: IfileSpecification): Promise<IpullRequest> {
  if (undefined == ConfigSpecification.githubPersonalToken) {
    throwCloseContributionError('No Github Personal Access Token configured. Unable to close contribution ' + spec.filename)
  }
  if (spec.pullNumber == undefined) {
    throwCloseContributionError('No Pull Number in specification. Unable to close contribution ' + spec.filename)
  }
  const gh = new M2mGitHub(ConfigSpecification.githubPersonalToken!, join(ConfigSpecification.getPublicDir()))
  try {
    await gh.init()
    const pullStatus = await gh.getPullRequest(spec.pullNumber!)
    const cspec = new ConfigSpecification()
    if (pullStatus.merged) {
      cspec.changeContributionStatus(spec.filename, SpecificationStatus.published, undefined)
    } else if (pullStatus.closed_at != null) {
      cspec.changeContributionStatus(spec.filename, SpecificationStatus.added, undefined)
    }
    spec = ConfigSpecification.getSpecificationByFilename(spec.filename)!
    if (spec.status != SpecificationStatus.contributed) gh.deleteSpecBranch(spec.filename)
    gh.fetchPublicFiles()
    return { merged: pullStatus.merged, closed: pullStatus.closed_at != null, pullNumber: spec.pullNumber! }
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    throwCloseContributionError('closeContribution: ' + msg)
  }
}
