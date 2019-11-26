import { join } from 'path';
import * as os from 'os';
import { mkdirSync } from 'fs';
import * as rimraf from 'rimraf';
import * as fs from 'fs-extra';
import { config } from 'dotenv';
export * from './projectMeta';
export * from './transformConfig';
export * from './awsExports';
export * from './sdk-calls';
export * from './api';
import * as nanoid from 'nanoid';
import { Readable } from 'stream';

const NANOID_LENGTH = 7;
const RADIX = 10;
// run dotenv config to update env variable
config();

export function getCLIPath() {
  return join(__dirname, '..', '..', '..', 'amplify-cli', 'bin', 'amplify');
}

export function createNewProjectDir(name: string, inCIMode: Boolean = isCI()): string {
  // if (!root) {
  //   root = join(__dirname, '../../../..', `amplify-integ-${Math.round(Math.random() * 100)}-test-${Math.round(Math.random() * 1000)}`);
  // }
  const dir = inCIMode ? join(os.homedir(), 'amplify-cli-e2e-tests') : join(__dirname, '../../../..');
  const root = join(dir, `${name}-${nanoid(NANOID_LENGTH)}`);
  mkdirSync(root);
  return root;
}

export function deleteProjectDir(root: string, inCIMode = isCI()) {
  if (!inCIMode) {
    return rimraf.sync(root);
  }
}

export function isCI(): Boolean {
  return process.env.CI ? true : false;
}

export function getEnvVars(): {} {
  return { ...process.env };
}

export function writeStdOutToDisk(filename: string, directoryName: string, stream: Readable) {
  const fileStartingWithNumberRegExp = /^(\d+)[-].*/;
  let fileNumber: number = 0;
  const logDirectoryName = join(directoryName, 'logs');
  fs.ensureDirSync(logDirectoryName);
  try {
    const filesWithNumber = fs
      .readdirSync(logDirectoryName)
      .filter(f => fs.statSync(join(logDirectoryName, f)).isFile())
      .filter(f => fileStartingWithNumberRegExp.test(f))
      .sort();
    if (filesWithNumber.length) {
      const lastIndex = fileStartingWithNumberRegExp.exec(filesWithNumber.pop())[1];
      fileNumber = Number.parseInt(lastIndex, RADIX);
    }
    fs.writeFileSync(join(logDirectoryName, `${fileNumber}-${filename}`), stream.);
  } catch (e) {
    console.log(`Error when writing content to disk ${join(directoryName, filename)}`, e);
  }
}
