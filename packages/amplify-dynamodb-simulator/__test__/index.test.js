const ddbSimulator = require('../');
const fs = require('fs-extra');
const { execSync } = require('child_process');

describe('emulator operations', () => {
  const dbPath = `${__dirname}/dynamodb-data/${process.pid}`;
  // taken from dynamodb examples.
  const dbParams = {
    AttributeDefinitions: [
      {
        AttributeName: 'Artist',
        AttributeType: 'S',
      },
      {
        AttributeName: 'SongTitle',
        AttributeType: 'S',
      },
    ],
    KeySchema: [
      {
        AttributeName: 'Artist',
        KeyType: 'HASH',
      },
      {
        AttributeName: 'SongTitle',
        KeyType: 'RANGE',
      },
    ],
    ProvisionedThroughput: {
      ReadCapacityUnits: 5,
      WriteCapacityUnits: 5,
    },
  };

  const ensureNoDbPath = () => {
    if (fs.existsSync(dbPath)) {
      fs.removeSync(dbPath);

    }
  };

  beforeEach(ensureNoDbPath);
  afterEach(ensureNoDbPath);

  let emulators;
  beforeEach(() => {
    emulators = [];
    jest.setTimeout(40 * 1000);
  });
  afterEach(async () => await Promise.all(emulators.map(emu => emu.terminate())));

  it('should support in memory operations', async () => {
    const emu = await ddbSimulator.launch();
    emulators.push(emu);
    const dynamo = ddbSimulator.getClient(emu);

    const tables = await dynamo.listTables().promise();
    expect(tables).toEqual({ TableNames: [] });
  });

  it('should preserve state between restarts with dbPath', async () => {
    const emuOne = await ddbSimulator.launch({ dbPath });
    emulators.push(emuOne);
    console.log('emuOne created')
    const dynamoOne = ddbSimulator.getClient(emuOne);
    console.log('ddbOneClinet received')
    await dynamoOne
      .createTable({
        TableName: 'foo',
        ...dbParams,
      })
      .promise();
    console.log('added record');
    await emuOne.terminate();
    console.log('termiated');

    const emuTwo = await ddbSimulator.launch({ dbPath });
    emulators.push(emuTwo);
    console.log('second emulator started')
    const dynamoTwo = await ddbSimulator.getClient(emuTwo);
    console.log('second client received');
    const t = await dynamoTwo.listTables().promise()
    expect(t).toEqual({
      TableNames: ['foo'],
    });
    console.log('second op done');
    emuTwo.terminate();
    console.log('terminated');
  });

  it('should start on specific port', async () => {
    const port = await require('portfinder').getPortPromise();
    const emu = await ddbSimulator.launch({ port });
    emulators.push(emu);
    expect(emu.port).toBe(port);
  });
});
