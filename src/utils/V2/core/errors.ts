export class OpenAIWrapperError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OpenAIWrapperError';
  }
}

export class APIError extends OpenAIWrapperError {
  constructor(
    message: string,
    public statusCode: number,
  ) {
    super(message);
    this.name = 'APIError';
  }
}

export class NetworkError extends OpenAIWrapperError {
  constructor(message: string) {
    super(message);
    this.name = 'NetworkError';
  }
}
