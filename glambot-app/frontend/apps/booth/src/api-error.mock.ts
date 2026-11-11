/**
 * Stand-in for api/client's ApiError in tests that mock the whole client module:
 * same constructor, without the network code.
 */
export class MockApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public userMessage?: string,
  ) {
    super(message);
  }
}
