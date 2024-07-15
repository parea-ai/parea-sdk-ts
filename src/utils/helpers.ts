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
