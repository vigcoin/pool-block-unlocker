import { BlockUnlocker } from '../src/block-unlocker';
import { RedisClient } from 'redis';
import { ConfigReader } from '@vigcoin/conf-reader';
import { Logger } from '@vigcoin/logger';
import { PoolRequest } from '@vigcoin/pool-request';
import * as fs from 'fs';
import * as path from 'path';
import { promisify } from 'util';
import { Router, Request, Response, Application } from 'express';
import * as express from 'express';
import * as bodyParser from 'body-parser';

const app: Application = express();
const app1: Application = express();

const file = path.resolve(__dirname, './config.json');
const reader = new ConfigReader(file);
const readConfig = reader.get({
  coreDevDonation: {
    aaa: 'sss',
  },
  devDonation: {
    aaa: 'sss',
  },
  extraFeaturesDevDonation: {},
});
const config = readConfig.config;
const redis = new RedisClient({});
const logger = new Logger(config.logger);
const pr = new PoolRequest(config.daemon, config.wallet, config.api);

const unlocker = new BlockUnlocker(redis, reader, logger, pr);

app.use(bodyParser());
app1.use(bodyParser());

app.all('/', (req, res) => {
  // console.log('inside body parser');
  // console.log(req.body);
  let height = req.body.params.height;
  if (height === 11) {
    res.status(500).end();
    return;
  }
  if (height === 2) {
    res.json({
      block_header: {
        hash: 11,
        depth: 100,
        reward: 1,
      },
    });
    return;
  }

  if (height === 2) {
    res.json({
      block_header: {
        hash: 13,
        depth: 10,
        reward: 1,
      },
    });
    return;
  }
  if (height === 1) {
    res.json({
      block_header: {
        hash: '12',
        depth: 100,
        reward: 1,
      },
    });
  } else {
    res.json({});
  }
});

app1.all('/', (req, res) => {
  // console.log('inside body parser 1');
  // console.log(req.body);
  res.end('end');
});

let server, server1;

test('Should init unlocker', () => {
  expect(unlocker).toBeTruthy();
});

test('Should run', async () => {
  await unlocker.run();
});

test('run daemon server', done => {
  server = app.listen(config.daemon.port, () => {
    // console.log('server running');
    done();
  });
});

test('run wallet server', done => {
  server1 = app.listen(config.wallet.port, () => {
    // console.log('server 1 running');

    done();
  });
});

test('Should flush all', done => {
  redis.flushall((err, succeeded) => {
    expect(!err).toBeTruthy();
    expect(succeeded).toBeTruthy();
    done();
  });
});

test('should adjust data', async () => {
  var dateNow = Date.now();
  var dateNowSeconds = (dateNow / 1000) | 0;

  const zadd = promisify(redis.zadd).bind(redis);
  const hset = promisify(redis.hset).bind(redis);

  await zadd(
    config.coin + ':blocks:candidates',
    3,
    [3, (Date.now() / 1000) | 0, 100, 20].join(':')
  );

  await zadd(
    config.coin + ':blocks:candidates',
    11,
    [11, (Date.now() / 1000) | 0, 100, 20].join(':')
  );
  await hset([config.coin, 'shares', 'round'].join(':'), '1', 1);
  await hset([config.coin, 'shares', 'round'].join(':'), '2', 1);
});

test('Should run again', done => {
  unlocker.run().then(() => {
    setTimeout(() => {
      console.log('run');
      done();
    }, 1000);
  });
});

test('should adjust data', async () => {
  var dateNow = Date.now();
  var dateNowSeconds = (dateNow / 1000) | 0;

  const zadd = promisify(redis.zadd).bind(redis);
  const hset = promisify(redis.hset).bind(redis);
  await zadd(
    config.coin + ':blocks:candidates',
    1,
    [1, (Date.now() / 1000) | 0, 100, 20].join(':')
  );

  await zadd(
    config.coin + ':blocks:candidates',
    2,
    [2, (Date.now() / 1000) | 0, 100, 20].join(':')
  );

  await zadd(
    config.coin + ':blocks:candidates',
    3,
    [3, (Date.now() / 1000) | 0, 100, 20].join(':')
  );

  await zadd(
    config.coin + ':blocks:candidates',
    11,
    [4, (Date.now() / 1000) | 0, 100, 20].join(':')
  );
  await hset([config.coin, 'shares', 'round'].join(':'), '1', 1);
  await hset([config.coin, 'shares', 'round'].join(':'), '2', 1);
});

test('Should run again', done => {
  unlocker.run().then(() => {
    setTimeout(() => {
      console.log('run');
      done();
    }, 1000);
  });
});

test('Should run', done => {
  unlocker.run().then(() => {
    setTimeout(() => {
      console.log('run');
      done();
    }, 1000);
  });
});

test('Should flush all', done => {
  redis.flushall((err, succeeded) => {
    expect(!err).toBeTruthy();
    expect(succeeded).toBeTruthy();
    done();
  });
});

test('Should run', done => {
  unlocker.run
    .apply({
      run: () => {},
      stopTimer: () => {},
      logger: { append: () => {} },
      config: {
        blockUnlocker: {
          interval: 0.1,
        },
      },
    })
    .then(() => {
      setTimeout(() => {
        done();
      }, 1000);
    });
});

test('Should get worker payments', () => {
  const pay = unlocker.getWorkerPayments(
    { aa: 1 },
    { workerShares: { aa: 10, bb: 10 }, shares: '11', height: 10 },
    10
  );
});

test('Should get donations', () => {
  const reward = unlocker.getDonationReward(
    { aa: 1 },
    { aa: 11, bb: 222 },
    { workerShares: { aa: 10, bb: 10 }, shares: '11', height: 10, reward: 100 }
  );
  expect(reward).toBeTruthy();
});

test('Should pay workers', () => {
  const reward = unlocker.payWorkers({ aa: '11', bb: '222', ccc: '0' });
  expect(reward).toBeTruthy();
});

test('Should log pay info', () => {
  unlocker.logPayInfo(
    { aa: '11', bb: '222', ccc: '0' },
    { workerShares: { aa: 10, bb: 10 }, shares: '11', height: 10, reward: 100 },
    true,
    10
  );
});

test('Should be able to mark block', async () => {
  await unlocker.markBlock(
    { height: '11', serialized: '222', hash: '0' },
    'vig'
  );
});

test('Should be able to clear orphaned blocks', async () => {
  console.log('inside orphaned aaa');
  try {
    await unlocker.clearOrphanedBlocks([
      { orphaned: true, height: '11', serialized: '222', hash: '0' },
    ]);
  } catch (e) {
    console.log(e);
  }
  try {
    await unlocker.clearOrphanedBlocks([
      { height: '11', serialized: '222', hash: '0' },
    ]);
  } catch (e) {
    console.log(e);
  }
  try {
    await unlocker.clearOrphanedBlocks([
      {
        height: '11',
        serialized: '222',
        hash: '0',
        time: Date.now(),
        difficulty: 111,
        shares: 111,
        orphaned: true,
        workerShares: { aaa: 111, bbb: 111, ccc: 333 },
      },
    ]);
  } catch (e) {
    console.log(e);
  }

  console.log('inside orphaned 1');
});

test('Should be able to process blocks', async () => {
  try {
    await unlocker.processUnlockedBlocks(
      [
        { height: '11', serialized: '222', hash: '0' },
        { height: '11', serialized: '222', hash: '0' },
        { height: '11', serialized: '222', hash: '0' },
        { height: '11', serialized: '222', hash: '0', orphaned: true },
      ],
      { aa: '11', bb: '222', ccc: '0' }
    );
  } catch (e) {
    console.log(e);
  }
});

test('Should flush all', done => {
  redis.flushall((err, succeeded) => {
    expect(!err).toBeTruthy();
    expect(succeeded).toBeTruthy();
    done();
  });
});

test('Should close all', () => {
  unlocker.stopTimer();
  redis.quit();
  server.close();
  server1.close();
});
