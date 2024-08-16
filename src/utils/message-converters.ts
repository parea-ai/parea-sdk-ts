import { Message, MessageConverter, Role } from '../types';
import { ChatCompletionMessageParam } from 'openai/src/resources/chat/completions';
import { ParsedChatCompletionMessage } from 'openai/src/resources/beta/chat/completions';

type T = any;

/**
 * Implements the MessageConverter interface for converting OpenAI messages.
 */
export class OpenAIMessageConverter implements MessageConverter {
  /**
   * Converts an OpenAI message to a standardized Message format.
   * @param m - The input message to be converted.
   * @returns A standardized Message object.
   */
  convert(m: ParsedChatCompletionMessage<T> | ChatCompletionMessageParam): Message {
    // type guard for ParsedChatCompletionMessage
    function isParsedChatCompletionMessage(message: any): message is ParsedChatCompletionMessage<T> {
      return 'parsed' in message;
    }

    if (m.role === 'tool') {
      return {
        role: Role.tool,
        content: JSON.stringify({ tool_call_id: m.tool_call_id, content: m.content }),
      };
    } else if (m.role === 'function') {
      return {
        role: Role.function,
        content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content),
      };
    } else if (m.role === 'assistant' && m?.refusal) {
      return {
        role: Role.assistant,
        content: JSON.stringify(m.refusal),
      };
    } else if (m.role === 'assistant' && isParsedChatCompletionMessage(m) && m?.parsed) {
      return {
        role: Role.assistant,
        content: JSON.stringify(m.parsed),
      };
    } else if (m.role === 'assistant' && !!m.function_call) {
      return {
        role: Role.assistant,
        content: JSON.stringify(m.function_call),
      };
    } else if (m.role === 'assistant' && !!m.tool_calls) {
      return {
        role: Role.assistant,
        content: JSON.stringify(m.tool_calls),
      };
    } else {
      return {
        role: Role[m.role as keyof typeof Role],
        content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content || {}),
      };
    }
  }
}
