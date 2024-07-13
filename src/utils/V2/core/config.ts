import dotenv from 'dotenv';

dotenv.config();

export const config = {
  apiKey: process.env.OPENAI_API_KEY,
  baseUrl: process.env.OPENAI_API_BASE_URL || 'https://api.openai.com/v1',
  maxRetries: parseInt(process.env.OPENAI_MAX_RETRIES || '3', 10),
  timeout: parseInt(process.env.OPENAI_TIMEOUT || '30000', 10),
};
