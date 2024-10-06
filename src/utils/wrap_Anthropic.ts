import Anthropic from '@anthropic-ai/sdk';
import { LLMInputs, Message, Role, TraceLog } from '../types';
import { pareaLogger } from '../parea_logger';
import { asyncLocalStorage, traceInsert } from './trace_utils';
import { genTraceId, toDateTimeString } from '../helpers';


function convertOAIMessage(m: any): Message {
    if (m.role === 'assistant' && !!m.tool_calls) {
      return {
        role: Role.assistant,
        content: formatToolCalls(m),
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

function wrapMethod(method: Function, idxArgs: number = 0) {
    return async function (this: any, ...args: any[]) {
      const traceId = genTraceId();
      const startTimestamp = new Date();
      let error: string | null = null;
      let status: string | undefined = 'success';
      let response: any = null;
      let endTimestamp: Date | null;
  
      const parentStore = asyncLocalStorage.getStore();
      const parentTraceId = parentStore ? Array.from(parentStore.keys())[0] : undefined;
      const rootTraceId = parentStore ? Array.from(parentStore.values())[0].rootTraceId : traceId;
  
      const kwargs = args[idxArgs];
      const functions = ["messages.create", "messages.stream"];
      const functionCallDefault = functions.length > 0 ? 'auto' : null;
  
      const modelParams = {
        temp: kwargs.temperature || 1.0,
        max_length: kwargs.max_tokens,
        top_p: kwargs.top_p || 1.0,
      };
  
      const configuration: LLMInputs = {
        model: kwargs.model,
        provider: 'antrhopic',
        messages: kwargs.messages?.map((message: any) => convertOAIMessage(message)),
        functions: functions,
        function_call: kwargs.function_call || kwargs.tool_choice || functionCallDefault,
        model_params: modelParams,
      };
  
      const traceLog: TraceLog = {
        trace_id: traceId,
        parent_trace_id: parentTraceId || traceId,
        root_trace_id: rootTraceId,
        trace_name: 'llm-anhtropic',
        start_timestamp: toDateTimeString(startTimestamp),
        configuration: configuration,
        children: [],
        status: status,
        experiment_uuid: process.env.PAREA_OS_ENV_EXPERIMENT_UUID || null,
      };
  
      return asyncLocalStorage.run(
        new Map([[traceId, { traceLog, threadIdsRunningEvals: [], rootTraceId }]]),
        async () => {
          if (parentStore && parentTraceId) {
            const parentTraceLog = parentStore.get(parentTraceId);
            if (parentTraceLog) {
              parentTraceLog.traceLog.children.push(traceId);
              parentStore.set(parentTraceId, parentTraceLog);
            }
          }
  
          try {
            response = await method.apply(this, args);
            traceInsert(
              {
                output: getOutput(response),
                input_tokens: response.usage.prompt_tokens,
                output_tokens: response.usage.completion_tokens,
                total_tokens: response.usage.total_tokens,
                cost: getTotalCost(args[idxArgs].model, response.usage.prompt_tokens, response.usage.completion_tokens),
              },
              traceId,
            );
          } catch (err: unknown) {
            if (err instanceof Error) {
              error = err.message;
            } else {
              error = 'An unknown error occurred';
            }
            status = 'error';
            traceInsert({ error, status }, traceId);
          } finally {
            endTimestamp = new Date();
            traceInsert(
              {
                end_timestamp: toDateTimeString(endTimestamp),
                latency: (endTimestamp.getTime() - startTimestamp.getTime()) / 1000,
                status: status,
              },
              traceId,
            );
            await pareaLogger.recordLog(traceLog);
          }
  
          if (error) {
            throw new Error(error);
          }
  
          return response;
        },
      );
    };
  }

  export function traceAntrhopicTriggerDev(ioAntrhopicCompletionsCreate: Function): Function {
    return wrapMethod(ioAntrhopicCompletionsCreate, 1);
  }
  
  export function patchAntrhopic(anthropic: Anthropic) {
    // @ts-ignores
    anthropic.completions.create = wrapMethod(anthropic.completions.create);
  }
  
let instant_pricing = {"prompt": 1.63, "completion": 5.51}
let claude_pricing = {"prompt": 8.00, "completion": 24.00}
type TokenLimit = {
    token_limit: { 
      max_prompt_tokens: number;
      max_completion_tokens: number;
    };
    prompt:number;
    completion:number;
  };
  
  type CostStructure = {
    [key: string]: TokenLimit; 
   

  };

  const ANHTROPIC_COST_MAPPING :CostStructure= {
    "claude-instant-1.1": {
      "token_limit": {
          "max_prompt_tokens": 9000,
          "max_completion_tokens": 4096,
          
      },
      "prompt":instant_pricing.prompt,
      "completion":instant_pricing.completion,
      
  },
  "claude-instant-1": {
      "token_limit": {
          "max_prompt_tokens": 100000,
          "max_completion_tokens": 4096,
      },
      "prompt":instant_pricing.prompt,
      "completion":instant_pricing.completion,
  },
  "claude-instant-1.2": {
      "token_limit": {
          "max_prompt_tokens": 100000,
          "max_completion_tokens": 4096,
      },
      "prompt":instant_pricing.prompt,
      "completion":instant_pricing.completion,
  },
  "claude-instant-1-100k": {
      "token_limit": {
          "max_prompt_tokens": 100000,
          "max_completion_tokens": 4096,
      },
      "prompt":instant_pricing.prompt,
      "completion":instant_pricing.completion,
  },
  "claude-instant-1.1-100k": {
      "token_limit": {
          "max_prompt_tokens": 100000,
          "max_completion_tokens": 4096,
      },
      "prompt":instant_pricing.prompt,
      "completion":instant_pricing.completion,
  },
  "claude-1": {
      "token_limit": {
          "max_prompt_tokens": 9000,
          "max_completion_tokens": 4096,
      },
      "prompt":claude_pricing.prompt,
      "completion":claude_pricing.completion,
  },
  "claude-2": {
      "token_limit": {
          "max_prompt_tokens": 100000,
          "max_completion_tokens": 4096,
      },
      "prompt":claude_pricing.prompt,
      "completion":claude_pricing.completion,
  },
  "claude-1-100k": {
      "token_limit": {
          "max_prompt_tokens": 100000,
          "max_completion_tokens": 4096,
      },
      "prompt":claude_pricing.prompt,
      "completion":claude_pricing.completion,
  },
  "claude-1.2": {
      "token_limit": {
          "max_prompt_tokens": 9000,
          "max_completion_tokens": 4096,
      },
      "prompt":claude_pricing.prompt,
      "completion":claude_pricing.completion,
  },
  "claude-1.3": {
      "token_limit": {
          "max_prompt_tokens": 9000,
          "max_completion_tokens": 4096,
      },
      "prompt":claude_pricing.prompt,
      "completion":claude_pricing.completion,
  },
  "claude-1.3-100k": {
      "token_limit": {
          "max_prompt_tokens": 100000,
          "max_completion_tokens": 4096,
      },
      "prompt":claude_pricing.prompt,
      "completion":claude_pricing.completion,
  },
  "claude-2.1": {
      "token_limit": {
          "max_prompt_tokens": 200000,
          "max_completion_tokens": 4096,
      },
      "prompt":claude_pricing.prompt,
      "completion":claude_pricing.completion,
  },
  "claude-3-opus-20240229": {
      "token_limit": {
          "max_prompt_tokens": 200000,
          "max_completion_tokens": 4096,
      },
      "prompt": 15.00,
      "completion": 75.00,
  },
  "claude-3-sonnet-20240229": {
      "token_limit": {"max_prompt_tokens": 200000, "max_completion_tokens": 4096},
      "prompt": 3.00,
      "completion": 15.00,
  },
  "claude-3-haiku-20240307": {
      "token_limit": {"max_prompt_tokens": 200000, "max_completion_tokens": 4096},
      "prompt": 0.25,
      "completion": 1.25,
  },
  
  }
  
  function getTotalCost(modelName: string, promptTokens: number, completionTokens: number): number {
    if (!Object.keys(ANHTROPIC_COST_MAPPING).includes(modelName)) {
      throw new Error(
        `Unknown model: ${modelName}. Please provide a valid OpenAI model name. Known models are: ${Object.keys(
          ANHTROPIC_COST_MAPPING,
        ).join(', ')}`,
      );
    }
    const modelCost = ANHTROPIC_COST_MAPPING[modelName];
    const promptCost = promptTokens * modelCost.prompt;
    const completionCost = completionTokens * modelCost.completion;
    return (promptCost + completionCost) / 1000000;
  }
  
  function getOutput(result: any): string {
    const responseMessage = result.choices[0]?.message;
    let completion: string = '';
    if (responseMessage.hasOwnProperty('function_call')) {
      completion = formatFunctionCall(responseMessage);
    } else if (responseMessage.hasOwnProperty('tool_calls')) {
      completion = formatToolCalls(responseMessage);
    } else {
      completion = responseMessage?.content?.trim() ?? '';
    }
    return completion;
  }
  
  function formatToolCalls(responseMessage: any): string {
    const formattedToolCalls: any[] = [];
    for (const toolCall of responseMessage['tool_calls']) {
      if (toolCall['type'] === 'function') {
        const functionName: string = toolCall['function']['name'];
        const functionArgs: any = parseArgs(toolCall['function']['arguments']);
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
  
  function formatFunctionCall(responseMessage: any): string {
    const functionName = responseMessage['function_call']['name'];
    const functionArgs: any = parseArgs(responseMessage['function_call']['arguments']);
    return `\`\`\`${JSON.stringify({ name: functionName, arguments: functionArgs }, null, 4)}\`\`\``;
  }
  
  function parseArgs(responseFunctionArgs: any): any {
    if (responseFunctionArgs instanceof Object) {
      return responseFunctionArgs;
    } else {
      return JSON.parse(responseFunctionArgs);
    }
  }
  