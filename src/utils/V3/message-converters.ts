import { Message, Role } from '../../types';
import { MessageConverter } from './types';

export class OpenAIMessageConverter implements MessageConverter {
  convert(m: any): Message {
    if (m?.role === 'assistant' && !!m?.tool_calls) {
      let content = `${m}`;
      try {
        content = this.formatToolCalls(m);
      } catch (e) {
        console.error(`Error converting assistant message with tool calls: ${e}`);
      }
      return {
        role: Role.assistant,
        content: content,
      };
    } else if (m.role === 'tool') {
      return {
        role: Role.tool,
        content: JSON.stringify({ tool_call_id: m.tool_call_id, content: m.content }),
      };
    } else {
      return {
        role: Role[m.role as keyof typeof Role],
        content: m.content,
      };
    }
  }

  private formatToolCalls(responseMessage: any): string {
    const formattedToolCalls: any[] = [];
    for (const toolCall of responseMessage['tool_calls']) {
      if (toolCall['type'] === 'function') {
        const functionName: string = toolCall['function']['name'];
        const functionArgs: any = this.parseArgs(toolCall['function']['arguments']);
        const toolCallId: string = toolCall['id'];
        formattedToolCalls.push({
          id: toolCallId,
          type: toolCall['type'],
          function: {
            name: functionName,
            arguments: functionArgs,
          },
        });
      } else {
        formattedToolCalls.push(toolCall);
      }
    }
    return JSON.stringify(formattedToolCalls, null, 4);
  }

  private parseArgs(responseFunctionArgs: any): any {
    if (responseFunctionArgs instanceof Object) {
      return responseFunctionArgs;
    } else {
      try {
        return JSON.parse(responseFunctionArgs);
      } catch (e) {
        console.error(`Error parsing tool call arguments as Object, storing as string instead: ${e}`);
        return typeof responseFunctionArgs === 'string' ? responseFunctionArgs : `${responseFunctionArgs}`;
      }
    }
  }
}
