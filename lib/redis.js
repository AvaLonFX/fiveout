import Redis from 'ioredis';

const redis = new Redis({
  host: process.env.REDIS_HOST || 'localhost', // Redis container's host
  port: process.env.REDIS_PORT || 6379, // Redis container's port
  // Optionally add more settings like password if needed
});

export default redis;
