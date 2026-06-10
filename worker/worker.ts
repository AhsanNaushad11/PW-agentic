import { Worker, Job } from 'bullmq';
import IORedis from 'ioredis';

const QUEUE_NAME = 'sqa-jobs';
const connection = new IORedis({
  host: 'localhost',
  port: 6379,
  maxRetriesPerRequest: null,
});

console.log(`Worker starting, listening to queue: ${QUEUE_NAME}`);

const worker = new Worker(
  QUEUE_NAME,
  async (job: Job) => {
    console.log(`Processing job ${job.id}...`);
    // Basic job completion logic as requested
    return { completed: true, jobId: job.id };
  },
  { connection }
);

worker.on('completed', (job) => {
  console.log(`Job ${job.id} has completed!`);
});

worker.on('failed', (job, err) => {
  console.log(`Job ${job?.id} has failed with ${err.message}`);
});

worker.on('error', (err) => {
  console.error(`Worker encountered an error: ${err.message}`);
});
