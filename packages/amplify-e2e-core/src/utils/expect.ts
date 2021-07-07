declare global {
  namespace NodeJS {
    interface Global {
      storeCLIExecutionLog: (data: any) => void;
    }
  }
}

import { types, format } from 'util';
import { Recorder } from '../asciinema-recorder';
import { AssertionError } from 'assert';
import strip = require('strip-ansi');
import { EOL } from 'os';
import retimer = require('retimer');
import { join, parse } from 'path';

const DEFAULT_NO_OUTPUT_TIMEOUT = 5 * 60 * 1000; // 5 Minutes
const EXIT_CODE_TIMEOUT = 2;
const EXIT_CODE_GENERIC_ERROR = 3;

export const KEY_UP_ARROW = '\x1b[A';
export const KEY_DOWN_ARROW = '\x1b[B';
// https://donsnotes.com/tech/charsets/ascii.html
export const CONTROL_C = '\x03';

type ExecutionStep = {
  fn: (data: string, lastLine?: boolean) => Promise<boolean> | boolean;
  shift: boolean;
  description: string;
  requiresInput: boolean;
  name: string;
  expectation?: any;
};

export type SpawnOptions = {
  noOutputTimeout?: number;
  cwd?: string | undefined;
  env?: object | any;
  stripColors?: boolean;
  ignoreCase?: boolean;
  disableCIDetection?: boolean;
};

export class Expect {
  public readonly command: string;
  public readonly cwd: string;
  public readonly env?: Record<string, string>;
  public readonly params: string[];
  public readonly stripColors: boolean = false;
  private process?: Recorder;
  public readonly noOutputTimeout: number;
  public readonly ignoreCase: boolean = true;
  private executionCompleteCallback?: (err?: any, code?: number) => void;

  private queue: ExecutionStep[];
  private noOutputTimer?: any;
  private stdout: string[] = [];

  // concatenated text used in case of windows which are not tested for expect yet
  private unProcessedLines: string = '';

  // Track if the execution state
  private errState?: Error;
  private responded: boolean = false;

  constructor(command: string | string[], params: string[] = [], options: SpawnOptions = {}) {
    if (Array.isArray(command)) {
      params = command;
      command = params.shift();
    } else if (typeof command === 'string') {
      const parsedPath = parse(command);
      const parsedArgs = parsedPath.base.split(' ');
      command = join(parsedPath.dir, parsedArgs[0]);
      params = params || parsedArgs.slice(1);
    }

    let childEnv = undefined;
    let pushEnv = undefined;

    // For push operations in E2E we have to explicitly disable the Amplify Console App creation
    // as for the tests that need it, it is already enabled for init, setting the env let here
    // disables the post push check we have in the CLI.
    if (params.length > 0 && params[0].toLowerCase() === 'push') {
      pushEnv = {
        CLI_DEV_INTERNAL_DISABLE_AMPLIFY_APP_CREATION: '1',
      };
    }

    // If we have an environment passed in we've to add the current process' environment, otherwised the forked
    // process would not have $PATH and others that is required to run amplify-cli successfully.
    // to be able to disable CI detection we do need to pass in a childEnv
    if (options.env || pushEnv || options.disableCIDetection === true) {
      childEnv = {
        ...process.env,
        ...pushEnv,
        ...options.env,
      };

      // Undo ci-info detection, required for some tests
      if (options.disableCIDetection === true) {
        delete childEnv.CI;
        delete childEnv.CONTINUOUS_INTEGRATION;
        delete childEnv.BUILD_NUMBER;
        delete childEnv.TRAVIS;
        delete childEnv.GITHUB_ACTIONS;
        delete childEnv.CIRCLECI;
        delete childEnv.CIRCLE_PULL_REQUEST;
      }
    }

    this.command = command;
    this.cwd = options.cwd;
    this.env = childEnv;
    this.ignoreCase = options.ignoreCase || true;
    this.noOutputTimeout = options.noOutputTimeout || DEFAULT_NO_OUTPUT_TIMEOUT;
    this.params = params;
    this.queue = [];
    this.stripColors = options.stripColors;
  }
  public expect = (expectation: string | RegExp): Expect => {
    let _expect: ExecutionStep = {
      fn: async (data, lastLine: boolean) => {
        return this.executeAndWait<boolean>(() => this.testExpectation(data, expectation));
      },
      name: '_expect',
      shift: true,
      description: `[expect] ${expectation}`,
      requiresInput: true,
      expectation: expectation,
    };
    this.queue.push(_expect);
    return this;
  };

  public pauseRecording = (): Expect => {
    let _pauseRecording: ExecutionStep = {
      fn: () => {
        this.process?.pauseRecording();
        return true;
      },
      name: '_pauseRecording',
      shift: true,
      description: '[pauseRecording]',
      requiresInput: false,
    };
    this.queue.push(_pauseRecording);
    return this;
  };

  public resumeRecording = (): Expect => {
    const _resumeRecording: ExecutionStep = {
      fn: data => {
        this.process?.resumeRecording();
        return true;
      },
      name: '_resumeRecording',
      shift: true,
      description: '[resumeRecording]',
      requiresInput: false,
    };
    this.queue.push(_resumeRecording);

    return this;
  };

  public wait = (expectation: string | RegExp, cb?: (data: string) => void): Expect => {
    let _wait: ExecutionStep = {
      fn: async (data, lastLine?: boolean) => {
        return this.executeAndWait(() => {
          let val = this.testExpectation(data, expectation, lastLine);
          if (val === true && typeof cb === 'function') {
            cb(data);
          }
          return val;
        });
      },
      name: '_wait',
      shift: false,
      description: `[wait] ${expectation}`,
      requiresInput: true,
      expectation: expectation,
    };
    this.queue.push(_wait);
    return this;
  };

  public sendLine = (line: string): Expect => {
    let _sendline: ExecutionStep = {
      fn: async () => {
        return this.executeAndWait(() => {
          this.process.write(`${line}${EOL}`);
          return true;
        });
      },
      name: '_sendline',
      shift: true,
      description: `[sendline] ${line}`,
      requiresInput: false,
    };
    this.queue.push(_sendline);
    return this;
  };

  public sendCarriageReturn = (): Expect => {
    let _sendline: ExecutionStep = {
      fn: () => {
        return this.executeAndWait(() => {
          this.process.write(EOL);
          return true;
        });
      },
      name: '_sendline',
      shift: true,
      description: '[sendline] <CR>',
      requiresInput: false,
    };
    this.queue.push(_sendline);
    return this;
  };

  public send = (line: string): Expect => {
    let _send: ExecutionStep = {
      fn: async () => {
        return this.executeAndWait(() => {
          this.process.write(line);
          return true;
        });
      },
      name: '_send',
      shift: true,
      description: `[send] ${line}`,
      requiresInput: false,
    };
    this.queue.push(_send);
    return this;
  };

  public sendKeyDown = (repeat?: number): Expect => {
    const repetitions = repeat ? Math.max(1, repeat) : 1;
    let _send: ExecutionStep = {
      fn: async () => {
        for (let i = 0; i < repetitions; i++) {
          await this.executeAndWait(() => this.process.write(KEY_DOWN_ARROW));
        }
        return true;
      },
      name: '_send',
      shift: true,
      description: `'[send] <Down> (${repetitions})`,
      requiresInput: false,
    };
    this.queue.push(_send);
    return this;
  };

  public sendKeyUp = (repeat?: number): Expect => {
    const repetitions = repeat ? Math.max(1, repeat) : 1;
    let _send: ExecutionStep = {
      fn: async () => {
        for (let i = 0; i < repetitions; i++) {
          await this.executeAndWait(() => this.process.write(KEY_UP_ARROW));
        }
        return true;
      },
      name: '_send',
      shift: true,
      description: `'[send] <Up> (${repetitions})`,
      requiresInput: false,
    };
    this.queue.push(_send);
    return this;
  };

  public sendConfirmYes = (): Expect => {
    let _send: ExecutionStep = {
      fn: async () => {
        return this.executeAndWait(() => {
          this.process.write(`Y${EOL}`);
          return true;
        });
      },
      name: '_send',
      shift: true,
      description: `'[send] Y <CR>`,
      requiresInput: false,
    };
    this.queue.push(_send);
    return this;
  };

  public sendConfirmNo = (): Expect => {
    let _send: ExecutionStep = {
      fn: async () => {
        return this.executeAndWait(() => {
          this.process.write(`N${EOL}`);
          return true;
        });
      },
      name: '_send',
      shift: true,
      description: `'[send] N <CR>`,
      requiresInput: false,
    };
    this.queue.push(_send);
    return this;
  };

  public sendCtrlC = (): Expect => {
    let _send: ExecutionStep = {
      fn: async () => {
        return this.executeAndWait(() => {
          this.process.write(`${CONTROL_C}${EOL}`);
          return true;
        });
      },
      name: '_send',
      shift: true,
      description: `'[send] Ctrl+C',`,
      requiresInput: false,
    };
    this.queue.push(_send);
    return this;
  };

  public sendEof = (): Expect => {
    let _sendEof: ExecutionStep = {
      fn: async () => {
        return this.executeAndWait(() => {
          this.process.write('');
          return true;
        });
      },
      shift: true,
      name: '_sendEof',
      description: '[sendEof]',
      requiresInput: false,
    };
    this.queue.push(_sendEof);
    return this;
  };

  public delay = (milliseconds: number): Expect => {
    let _delay: ExecutionStep = {
      fn: async () => {
        return this.executeAndWait(() => {
          return true;
        }, milliseconds);
      },
      shift: true,
      name: '_delay',
      description: `'[delay] (${milliseconds})`,
      requiresInput: false,
    };
    this.queue.push(_delay);
    return this;
  };

  public run = (cb: (err: any, signal?: any) => void): Expect => {
    try {
      this.process = new Recorder(this.command, this.params, {
        cwd: this.cwd,
        env: this.env,
      });

      this.executionCompleteCallback = cb;

      this.process.addOnDataHandler(this.onLine);

      this.process.addOnExitHandlers(this.exitHandler);

      this.process.run();
      this.noOutputTimer = retimer(() => {
        this.exitHandler(EXIT_CODE_TIMEOUT, 'SIGTERM');
      }, this.noOutputTimeout);
    } catch (e) {
      this.onError(e, true);
    }
    return this;
  };

  private testExpectation = (data: string, expectation: string | RegExp, lastLine: boolean = false): boolean => {
    if (process.platform === 'win32' && !lastLine) {
      // // Todo: remove this before PR. For debugging in CircleCI
      // console.log('testExpectation');
      // console.log('expectation ===>', expectation);
      // console.log('unProcessedLines =>>>', this.unProcessedLines);
      // console.log('\n\n\n\n\n\n\n\n\n');

      let result;
      if (types.isRegExp(expectation)) {
        result = expectation.test(this.unProcessedLines);
        if (result) {
          const details = this.unProcessedLines.match(expectation);
          if (typeof details.index !== undefined) {
            this.unProcessedLines = this.unProcessedLines.substr(details.index + details[0].length);
          }
        }
      } else if (this.ignoreCase) {
        const index = this.unProcessedLines.toLowerCase().indexOf(expectation.toLowerCase());
        result = index > -1;
        if (result) {
          this.unProcessedLines = this.unProcessedLines.substr(index + expectation.length);
        }
      } else {
        const index = this.unProcessedLines.indexOf(expectation);
        result = index > -1;
        if (result) {
          this.unProcessedLines = this.unProcessedLines.substr(index + expectation.length);
        }
      }
      return result;
    } else {
      if (types.isRegExp(expectation)) {
        return expectation.test(data);
      } else if (this.ignoreCase) {
        return data.toLowerCase().indexOf(expectation.toLowerCase()) > -1;
      } else {
        return data.indexOf(expectation) > -1;
      }
    }
  };

  private exitHandler = async (code: number, signal: any) => {
    this.noOutputTimer?.clear();
    this.process?.removeOnExitHandlers(this.exitHandler);
    if (code !== 0) {
      if (code === EXIT_CODE_TIMEOUT) {
        const err = new Error(
          `Killed the process as no output receive for ${this.noOutputTimeout / 1000} Sec. The no output timeout is set to ${
            this.noOutputTimeout / 1000
          }`,
        );
        return this.onError(err, true);
      } else if (code === 127) {
        // XXX(sam) Not how node works (anymore?), 127 is what /bin/sh returns,
        // but it appears node does not, or not in all conditions, blithely
        // return 127 to user, it emits an 'error' from the child_process.

        //
        // If the response code is `127` then `context.command` was not found.
        //
        return this.onError(new Error('Command not found: ' + this.command), false);
      }
      return this.onError(new Error(`Process exited with non zero exit code ${code}`), false);
    } else {
      if (this.queue.length && !(await this.flushQueue())) {
        // if flushQueue returned false, onError was called
        return;
      }
      this.recordOutputs(code);
      this.executionCompleteCallback(null, signal || code);
    }
  };

  /**
   * Helper function to respond to the callback with a
   * specified error. Kills the child process if necessary.
   * @param err
   * @param kill
   * @param errorCode
   * @returns
   */
  private onError = (err: Error, kill: boolean, errorCode: number = EXIT_CODE_GENERIC_ERROR): void => {
    if (this.errState || this.responded) {
      return;
    }

    this.recordOutputs(errorCode);
    this.errState = err;
    this.responded = true;

    if (kill) {
      try {
        this.process.kill();
      } catch (ex) {}
    }

    this.executionCompleteCallback(err, errorCode);
  };

  private validateFnType = (step: ExecutionStep): boolean => {
    const currentFn = step.fn;
    const currentFnName = step.name;
    if (typeof currentFn !== 'function') {
      //
      // If the `currentFn` is not a function, short-circuit with an error.
      //
      this.onError(new Error('Cannot process non-function on nexpect stack.'), true);
      return false;
    } else if (
      ['_expect', '_sendline', '_send', '_wait', '_sendEof', '_delay', '_pauseRecording', '_resumeRecording'].indexOf(currentFnName) === -1
    ) {
      //
      // If the `currentFn` is a function, but not those set by `.sendline()` or
      // `.expect()` then short-circuit with an error.
      //
      this.onError(new Error('Unexpected context function name: ' + currentFn.name), true);
      return false;
    }

    return true;
  };

  /**
   * Core evaluation logic that evaluates the next function in
   * queue against the specified `data` where the last
   * function run had `name`.
   * @param data
   * @param callerFunctionName
   * @returns
   */
  private evalContext = async (data: string, callerFunctionName?: string): Promise<void> => {
    if (this.queue.length === 0) {
      return;
    }
    const step = this.queue[0];
    const { fn: currentFn, name: currentFnName, shift } = step;

    if (!currentFn || (callerFunctionName === '_expect' && currentFnName === '_expect')) {
      //
      // If there is nothing left on the context or we are trying to
      // evaluate two consecutive `_expect` functions, return.
      //
      return;
    }

    if (shift) {
      this.queue.shift();
    }

    if (!this.validateFnType(step)) {
      return;
    }

    if (currentFnName === '_expect') {
      //
      // If this is an `_expect` function, then evaluate it and attempt
      // to evaluate the next function
      // This is needed as some of the functions don't need any output from the program that is being
      // executed. For instance one would wait for a prompt and as soon as the prompt is seen send input
      return (await currentFn(data)) === true
        ? await this.evalContext(data, '_expect')
        : this.onError(this.createExpectationError(step.expectation, data), true);
    } else if (currentFnName === '_wait') {
      //
      // If this is a `_wait` function, then evaluate it and if it returns true,
      // then evaluate the function (in case it is a `_sendline` function).
      // This is different from _expect as in case of _wait, when condition is fulfilled, the wait condition
      // has to be removed from the queue
      if ((await currentFn(data)) === true) {
        this.queue.shift();
        this.evalContext(data, '_expect');
      }
    } else {
      //
      // If the `currentFn` is any other function then evaluate it
      //
      if (await currentFn(data)) {
        // Evaluate the next function if it does not need input
        var nextFn = this.queue[0];
        if (['_pauseRecording', '_resumeRecording'].includes(step.name)) {
          await this.evalContext(data, '_expect');
        } else if (nextFn && !nextFn.requiresInput) {
          // console.log('next function does not require input. Executing it');
          await this.evalContext(data);
          // console.log('next function execution done');
        }
      }
    }
  };

  /**
   * Pre-processes the `data` from the child `process` on the
   * specified `stream` and then evaluates the processed lines:
   *

   * 1. Reset the no output timer
   * 2. Stripping ANSI colors (if necessary)
   * 3. Splitting `data` into multiple lines.
   *
   * @param data string
   */
  private onLine = (data: string | Buffer): void => {
    this.noOutputTimer?.reschedule(this.noOutputTimeout);
    data = data.toString();
    if (process.env && process.env.VERBOSE_LOGGING_DO_NOT_USE_OR_YOU_WILL_BE_FIRED) {
      console.log(data);
    }
    if (this.stripColors) {
      data = strip(data);
    }

    const lines: string[] = data.split(EOL).filter(function (line) {
      return line.length > 0 && line !== '\r';
    });

    this.stdout = this.stdout.concat(lines);

    if (process.platform === 'win32') {
      this.unProcessedLines += lines.map(l => l.replace(new RegExp('\\r\\n', 'ig'), '')).join('');
      this.evalContext(lines.map(l => l.replace(new RegExp('\\r\\n', 'ig'), '')).join(''), null);
    } else {
      while (lines.length > 0) {
        this.evalContext(lines.shift(), null);
      }
    }
  };

  /**
   *  Helper function which flushes any remaining functions from
   * @returns if the queue is empty
   */
  private flushQueue = async (): Promise<boolean> => {
    const remainingQueue = this.queue.slice().map(item => {
      const description = ['_sendline', '_send'].includes(item.name) ? `[${item.name}] **redacted**` : item.description;
      return {
        ...item,
        description,
      };
    });
    const step = this.queue.shift();
    const { fn: currentFn, name: currentFnName } = step;
    const newlineRegEx = process.platform == 'win32' ? new RegExp('\\r\\n', 'ig') : '\r';
    const nonEmptyLines = this.stdout.map(line => line.replace(newlineRegEx, '').trim()).filter(line => line !== '');

    let lastLine = nonEmptyLines[nonEmptyLines.length - 1];

    if (!lastLine) {
      this.onError(this.createUnexpectedEndError('No data from child with non-empty queue.', remainingQueue), false);
      return false;
    } else if (this.queue.length > 0) {
      this.onError(this.createUnexpectedEndError('Non-empty queue on spawn exit.', remainingQueue), true);
      return false;
    } else if (!this.validateFnType(step)) {
      // onError was called
      return false;
    } else if (currentFnName === '_sendline') {
      this.onError(new Error('Cannot call sendline after the process has exited'), false);
      return false;
    } else if (currentFnName === '_wait' || currentFnName === '_expect') {
      if ((await currentFn(lastLine, true)) !== true) {
        this.onError(this.createExpectationError(step.expectation, lastLine), false);
        return false;
      }
    }

    return true;
  };

  private createExpectationError = (expected: string | RegExp, actual: string): AssertionError => {
    var expectation;
    if (types.isRegExp(expected)) {
      expectation = 'to match ' + expected;
    } else {
      expectation = 'to contain ' + JSON.stringify(expected);
    }

    var err = new AssertionError({
      message: format('expected %j %s', actual, expectation),
      actual: actual,
      expected: expected,
    });
    return err;
  };

  private createUnexpectedEndError = (message: string, remainingQueue: ExecutionStep[]): AssertionError => {
    const desc: string[] = remainingQueue.map(function (it) {
      return it.description;
    });
    var msg = message + '\n' + desc.join('\n');

    return new AssertionError({
      message: msg,
      expected: [],
      actual: desc,
    });
  };

  private recordOutputs = (code: number) => {
    if (global.storeCLIExecutionLog) {
      global.storeCLIExecutionLog({
        cmd: this.command,
        cwd: this.cwd,
        exitCode: code,
        params: this.params,
        recording: this.getRecording(),
      });
    }
  };

  private getRecording = (): string | void => {
    return this.process?.getRecording();
  };

  private executeAndWait = async <T>(fn: () => T, msec: number = 50): Promise<T> => {
    const result = await fn();
    return new Promise(resolve => {
      setTimeout(() => resolve(result), msec);
    });
  };
}

export function nspawn(command: string | string[], params: string[] = [], options: SpawnOptions = {}) {
  return new Expect(command, params, options);
}
