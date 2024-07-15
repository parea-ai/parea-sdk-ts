import { EvalFunctionReturn, EvaluationResult } from '../types';

/**
 * Extracts the parameter names from a given function.
 * @param func - The function to extract parameter names from.
 * @returns An array of parameter names as strings.
 * @throws {Error} If there's an error during the extraction process.
 */
export function extractFunctionParamNames(func: Function): string[] {
  try {
    const functionString = func.toString();
    const match = functionString.match(/\(([^)]*)\)/);
    if (!match) return []; // handle case of no match (shouldn't happen if function is valid)

    const paramNamesRaw = match[1]; // get the raw parameters string
    return paramNamesRaw
      .split(',')
      .map((param) => {
        // use regex to match the parameter name, it should be the first word before space or colon
        const match = param.trim().match(/(\w+)/);
        return match ? match[0] : ''; // return the matched parameter name, or empty string if no match
      })
      .filter((param) => param !== '');
  } catch (e) {
    console.error(`Error extracting function param names: ${e}`);
    return [];
  }
}

/**
 * Extracts function parameters and their values from a given function and arguments.
 * @param func - The function to extract parameters from.
 * @param args - An array of argument values passed to the function.
 * @returns An object where keys are parameter names and values are the corresponding argument values.
 */
export function extractFunctionParams(func: Function, args: any[]): { [key: string]: any } {
  const paramNames = extractFunctionParamNames(func);

  // Constructing an object of paramName: value
  return paramNames.reduce((acc, paramName, index) => {
    return {
      ...acc,
      [paramName]:
        typeof args[index] === 'string'
          ? args[index]
          : Array.isArray(args[index])
          ? args[index]
          : JSON.stringify(args[index]),
    };
  }, {});
}

/**
 * Processes the result of an evaluation function and pushes it to the scores array.
 * @param funcName - The name of the evaluation function.
 * @param result - The result returned by the evaluation function.
 * @param scores - The array to which the processed result will be pushed.
 */
export function processEvaluationResult(
  funcName: string,
  result: EvalFunctionReturn,
  scores: EvaluationResult[],
): void {
  if (result !== undefined && result !== null) {
    if (typeof result === 'number') {
      scores.push({ name: funcName, score: result });
    } else if (typeof result === 'boolean') {
      scores.push({ name: funcName, score: result ? 1 : 0 });
    } else if (Array.isArray(result)) {
      scores.push(...result);
    } else {
      scores.push(result as EvaluationResult);
    }
  }
}
