/**
 * LLM Client - OpenAI-compatible client
 *
 * Supports OpenAI, Anthropic (via vertex), local LLMs (ollama, vllm)
 */

import OpenAI from 'openai';
import type { LLMConfig, LLMCompleteOptions, LLMCompleteResponse } from './types';

export class LLMClient {
  private client: OpenAI;
  private config: LLMConfig;

  constructor(config: LLMConfig) {
    this.config = config;
    this.client = new OpenAI({
      baseURL: config.baseURL,
      apiKey: config.apiKey || 'not-needed', // Some local LLMs don't need API keys
    });
  }

  /**
   * Complete a chat conversation
   */
  async complete(options: LLMCompleteOptions): Promise<LLMCompleteResponse> {
    try {
      const response = await this.client.chat.completions.create({
        model: this.config.model,
        messages: options.messages,
        temperature: options.temperature ?? 0.7,
        max_tokens: options.maxTokens ?? 4096,
        stream: false, // For now, don't support streaming
      });

      const choice = response.choices[0];
      if (!choice) {
        throw new Error('No response from LLM');
      }

      return {
        content: choice.message.content || '',
        usage: response.usage
          ? {
              promptTokens: response.usage.prompt_tokens,
              completionTokens: response.usage.completion_tokens,
              totalTokens: response.usage.total_tokens,
            }
          : undefined,
      };
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`LLM completion failed: ${error.message}`);
      }
      throw error;
    }
  }

  /**
   * Test connection to LLM
   */
  async testConnection(): Promise<boolean> {
    try {
      await this.complete({
        messages: [
          {
            role: 'user',
            content: 'Hello, are you available?',
          },
        ],
        maxTokens: 10,
      });
      return true;
    } catch (error) {
      console.error('LLM connection test failed:', error);
      return false;
    }
  }
}

/**
 * Create LLM client from environment variables
 */
export function createLLMClient(): LLMClient {
  const config: LLMConfig = {
    baseURL: process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1',
    apiKey: process.env.OPENAI_API_KEY || '',
    model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
  };

  return new LLMClient(config);
}
