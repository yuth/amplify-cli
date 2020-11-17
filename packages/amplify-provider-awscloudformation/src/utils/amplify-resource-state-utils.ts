import { Template } from "cloudform-types";
import fs from 'fs-extra';
import path from 'path';
import _ from 'lodash';

export function loadDiffableProject(
  path: string,
  rootStackName: string
): DiffableProject {
  const project = readFromPath(path);
  const currentStacks = project.stacks || {};
  const diffableProject: DiffableProject = {
    stacks: {},
    root: {},
  };
  for (const key of Object.keys(currentStacks)) {
    diffableProject.stacks[key] = JSON.parse(project.stacks[key]);
  }
  diffableProject.root = JSON.parse(project[rootStackName]);
  return diffableProject;
}

export function readFromPath(directory: string): any {
  const pathExists = fs.pathExistsSync(directory);
  if (!pathExists) {
    return;
  }
  const dirStats = fs.lstatSync(directory);
  if (!dirStats.isDirectory()) {
    const buf = fs.readFileSync(directory);
    return buf.toString();
  }
  const files = fs.readdirSync(directory);
  const accum = {};
  for (const fileName of files) {
    const fullPath = path.join(directory, fileName);
    const value = this.readFromPath(fullPath);
    accum[fileName] = value;
  }
  return accum;
}

export interface DiffableProject {
  stacks: {
    [stackName: string]: Template;
  };
  root: Template;
}

export interface StateMachinePage {
  stackName: string;
  tables: Array<string>;
  parameters?: Object;
}

export class TemplateState {

  private changes: { [key: string]: string[] } = {};

  public has(key: string) {
    return Boolean(key in this.changes);
  }

  public isEmpty(): Boolean {
    return !Object.keys(this.changes).length;
  }

  public get(key: string): string[] {
    return this.changes[key];
  }

  public getLatest(key: string): Template | null {
    if (this.changes[key]) {
      const length = this.changes[key].length;
      return length ? JSON.parse(this.changes[key][length - 1]) : null;
    }
    return null;
  }

  public pop(key: string): Template {
    const template = this.changes[key].shift();
    if(_.isEmpty(this.changes[key])) {
      delete this.changes[key];
    }
    return JSON.parse(template);
  }

  public add(key: string, val: string): void {
    if (!(key in this.changes)) {
      this.changes[key] = [];
    }
    this.changes[key].push(val);
  }

  public getChangeCount(key: string): number {
    return this.changes[key].length;
  }

  public getKeys(): Array<string> {
    return Object.keys(this.changes);
  }
}