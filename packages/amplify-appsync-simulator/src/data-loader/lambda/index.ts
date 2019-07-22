import { AmplifyAppSyncSimulatorDataLoader } from '..';

export class LambdaDataLoader implements AmplifyAppSyncSimulatorDataLoader {
    // XXX: Implement
    constructor(private _config) {
      console.log(_config)
    }
  load(req): any {
    return req.payload;
  }
}
