import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { keyBy } from 'lodash';

interface FilePayload {
  readonly filename: string;
}

export const readJsonFile = (filePath: string) => JSON.parse(readFileSync(filePath).toString('utf8'));

export const readJsonDirectoryAsArray = (directoryPath: string): FilePayload[] =>
  readdirSync(directoryPath).map((filename) => ({
    ...readJsonFile(join(directoryPath, filename)),
    filename,
  }));

export const readJsonDirectoryAsObject = (directoryPath: string): Record<string, {}> =>
  keyBy(readJsonDirectoryAsArray(directoryPath), 'filename');
