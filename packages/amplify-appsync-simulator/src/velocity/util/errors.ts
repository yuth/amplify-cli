export class Unauthorized extends Error {}

export class TemplateSentError extends Error {
  constructor(gqlMessage, errorType, data, errorInfo) {
    super(gqlMessage);
    Object.assign(this, { gqlMessage, errorType, data, errorInfo });
  }
}
export class ValidateError extends Error {
  constructor(gqlMessage, type, data) {
    super(gqlMessage);
    Object.assign(this, { gqlMessage, type, data });
  }
}

