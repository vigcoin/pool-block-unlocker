import { ConfigReader } from '@vigcoin/conf-reader';
import { Logger } from '@vigcoin/logger';
import { PoolRequest } from '@vigcoin/pool-request';
import { RedisClient } from 'redis';
import { promisify } from 'util';

export class BlockUnlocker {
  private configReader: ConfigReader;
  private config: any;
  private donations: any;
  private logger: Logger;
  private req: PoolRequest;
  private redis: RedisClient;
  private timer: NodeJS.Timer;

  constructor(
    redis: RedisClient,
    configReader: ConfigReader,
    logger: Logger,
    req: PoolRequest
  ) {
    this.configReader = configReader;
    const reader = configReader.get();
    this.config = reader.config;
    this.donations = reader.donations;
    this.redis = redis;
    this.logger = logger;
    this.req = req;
  }

  public stopTimer() {
    clearTimeout(this.timer);
  }

  public async run() {
    try {
      const blocks = await this.getCandidates(this.config.coin);

      if (blocks) {
        const unlocked = await this.getUnlockedBlocks(blocks);
        if (unlocked) {
          await this.getShares(unlocked);
          await this.clearOrphanedBlocks(unlocked);
          await this.processUnlockedBlocks(unlocked, this.donations);
        }
      }
    } catch (e) {
      this.logger.append(
        'error',
        'unlocker',
        'Error processing unlocked blocks: %j',
        [e]
      );
    }

    this.stopTimer();
    this.timer = setTimeout(() => {
      this.run();
    }, this.config.blockUnlocker.interval * 1000);
  }

  // Get all block candidates in redis
  private async getCandidates(coin: string) {
    const zrange = promisify(this.redis.zrange).bind(this.redis);
    const candidates = await zrange(
      [coin, 'blocks', 'candidates'].join(':'),
      0,
      -1,
      'WITHSCORES'
    );
    if (!candidates || !candidates.length) {
      this.logger.append(
        'error',
        'unlocker',
        'No blocks candidates in redis',
        []
      );
      return;
    }
    const blocks = [];

    for (let i = 0; i < candidates.length; i += 2) {
      const parts = candidates[i].split(':');
      blocks.push({
        difficulty: parts[2],
        hash: parts[0],
        height: parseInt(candidates[i + 1], 10),
        serialized: candidates[i],
        shares: parts[3],
        time: parts[1],
      });
    }
    return blocks;
  }

  // Check if blocks are orphaned
  private async getUnlockedBlocks(blocks: any) {
    const unlocked: any = [];
    for (let block of blocks) {
      const headerInfo: any = await this.req.daemon(
        '/',
        'getblockheaderbyheight',
        {
          height: block.height,
        }
      );
      if (!headerInfo.block_header) {
        block.unlocked = false;
        this.logger.append(
          'error',
          'unlocker',
          'Error with getblockheaderbyheight, no details returned for %s - %j',
          [block.serialized, headerInfo]
        );
        break;
      }
      const blockHeader = headerInfo.block_header;
      const locked = blockHeader.depth >= this.config.blockUnlocker.depth;
      block.orphaned = blockHeader.hash === block.hash ? 0 : 1;
      block.unlocked = locked;
      block.reward = blockHeader.reward;
      // console.log(block);
      if (block.unlocked) {
        unlocked.push(block);
      }
      console.log(unlocked);
    }

    if (unlocked.length < 1) {
      this.logger.append(
        'info',
        'unlocker',
        'No pending blocks are unlocked yet (%d pending)',
        [blocks.length]
      );
      return false;
    }
    return unlocked;
  }

  // Get worker shares for each unlocked block
  private async getShares(blocks: any) {
    const hgetall = promisify(this.redis.hgetall).bind(this.redis);
    for (let block of blocks) {
      block.workerShares = await hgetall(
        [this.config.coin, 'shares', 'round', block.height].join(':')
      );
    }
  }

  // Handle orphaned blocks
  async clearOrphanedBlocks(blocks: any) {
    const del = promisify(this.redis.del).bind(this.redis);
    const zrem = promisify(this.redis.zrem).bind(this.redis);
    const zadd = promisify(this.redis.zadd).bind(this.redis);
    const hincrby = promisify(this.redis.hincrby).bind(this.redis);
    console.log('clear orphan');

    for (let block of blocks) {
      if (!block.orphaned) {
        break;
      }

      console.log(block);

      console.log('clear orhpaned');

      await del([this.config.coin, 'shares', 'round', block.height].join(':'));
      await zrem(
        [this.config.coin, 'blocks', 'candidates'].join(':'),
        block.serialized
      );
      await zadd(
        [this.config.coin, 'blocks', 'matured'].join(':'),
        block.height,
        [
          block.hash,
          block.time,
          block.difficulty,
          block.shares,
          block.orphaned,
        ].join(':')
      );

      console.log(block.workerShares);

      if (block.workerShares) {
        for (let worker of Object.keys(block.workerShares)) {
          await hincrby(
            this.config.coin + ':shares:roundCurrent',
            worker,
            block.workerShares[worker]
          );
        }
      }
    }
  }

  // Handle unlocked blocks
  async processUnlockedBlocks(blocks: any, donations: any) {
    let totalBlocksUnlocked = 0;
    const payments: any = {};
    try {
      for (let block of blocks) {
        if (block.orphaned) {
          break;
        }
        totalBlocksUnlocked++;

        await this.markBlock(block, this.config.coin);
        let reward = this.getDonationReward(payments, donations, block);
        this.getWorkerPayments(payments, block, reward);
      }
      let paid = await this.payWorkers(payments);
      this.logPayInfo(payments, blocks, paid, totalBlocksUnlocked);
    } catch (e) {
      this.logger.append('error', 'unlocker', 'Error unlocking blocks: %j', [
        e,
      ]);
    }
  }

  async markBlock(block: any, coin: string) {
    const del = promisify(this.redis.del).bind(this.redis);
    const zrem = promisify(this.redis.zrem).bind(this.redis);
    const zadd = promisify(this.redis.zadd).bind(this.redis);
    await del([coin, 'shares', 'round', block.height].join(':'));
    await zrem([coin, 'blocks', 'candidates'].join(':'), block.serialized);
    await zadd(
      [coin, 'blocks', 'matured'].join(':'),
      block.height,
      [
        block.hash,
        block.time,
        block.difficulty,
        block.shares,
        block.orphaned,
      ].join(':')
    );
  }

  logPayInfo(
    payments: any,
    blocks: any,
    paid: boolean,
    totalBlocksUnlocked: number
  ) {
    if (!paid) {
      this.logger.append(
        'info',
        'unlocker',
        'No unlocked blocks yet (%d pending)',
        [blocks.length]
      );
      return;
    }

    this.logger.append(
      'info',
      'unlocker',
      'Unlocked %d blocks and update balances for %d workers',
      [String(totalBlocksUnlocked), String(Object.keys(payments).length)]
    );
  }

  async payWorkers(payments: any) {
    const hincrby = promisify(this.redis.hincrby).bind(this.redis);
    let paid = false;
    for (const worker of Object.keys(payments)) {
      const amount = parseInt(payments[worker], 10);
      if (amount <= 0) {
        delete payments[worker];
        continue;
      }
      await hincrby(
        [this.config.coin, 'workers', worker].join(':'),
        'balance',
        amount
      );
      paid = true;
    }
    return paid;
  }

  getDonationReward(payments: any, donations: any, block: any) {
    let feePercent = this.config.blockUnlocker.poolFee / 100;
    const reward = Math.round(block.reward - block.reward * feePercent);

    for (const wallet of Object.keys(donations)) {
      const percent = donations[wallet] / 100;
      feePercent += percent;
      payments[wallet] = Math.round(block.reward * percent);
      this.logger.append(
        'info',
        'unlocker',
        'Block %d donation to %s as %d percent of reward: %d',
        [block.height, wallet, percent, payments[wallet]]
      );
    }

    this.logger.append(
      'info',
      'unlocker',
      'Unlocked %d block with reward %d and donation fee %d. Miners reward: %d',
      [block.height, block.reward, feePercent, reward]
    );
    return reward;
  }

  getWorkerPayments(payments: any, block: any, reward: number) {
    if (block.workerShares) {
      const totalShares = parseInt(block.shares, 10);
      for (const worker of Object.keys(block.workerShares)) {
        const percent = block.workerShares[worker] / totalShares;
        const workerReward = Math.round(reward * percent);
        payments[worker] = (payments[worker] || 0) + workerReward;
        this.logger.append(
          'info',
          'unlocker',
          'Block %d payment to %s for %d shares: %d',
          [block.height, worker, totalShares, payments[worker]]
        );
      }
    }
  }
}
