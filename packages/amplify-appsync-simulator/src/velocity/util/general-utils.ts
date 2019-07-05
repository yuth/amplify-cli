import { Unauthorized, ValidateError, TemplateSentError } from './errors';
import * as autoId from 'uuid/v4';
export const generalUtils = {
  errors:[],
  quiet: () => '',
  qr: () => '',
  escapeJavaScript(value) {
    return require('js-string-escape')(value);
  },
  urlEncode(value) {
    return encodeURI(value);
  },
  urlDecode(value) {
    return decodeURI(value);
  },
  base64Encode(value) {
    // eslint-disable-next-line
    return new Buffer(value).toString('base64');
  },
  base64Decode(value) {
    // eslint-disable-next-line
    return new Buffer(value, 'base64').toString('ascii');
  },
  parseJson(value) {
    return JSON.parse(value);
  },
  toJson(value) {
    return JSON.stringify(value);
  },
  autoId() {
    return autoId();
  },
  unauthorized() {
    const err = new Unauthorized('Unauthorized');
    this.errors.push(err);
    throw err;
  },
  error(message, type = null, data = null, errorInfo = null) {
    const err = new TemplateSentError(message, type, data, errorInfo);
    this.errors.push(err);
    throw err;
  },
  appendError(message, type = null, data = null, errorInfo = null) {
    this.errors.push(new TemplateSentError(message, type, data, errorInfo));
    return '';
  },
  getErrors() {
    return this.errors;
  },
  validate(allGood, message, type, data) {
    if (allGood) return '';
    throw new ValidateError(message, type, data);
  },
  isNull(value) {
    return value === null || !value;
  },
  isNullOrEmpty(value) {
    return !!value;
  },
  isNullOrBlank(value) {
    return !!value;
  },
  defaultIfNull(value, defaultValue = '') {
    if (value !== null && value !== undefined) return value;
    return defaultValue;
  },
  defaultIfNullOrEmpty(value, defaultValue) {
    if (value) return value;
    return defaultValue;
  },
  defaultIfNullOrBlank(value, defaultValue) {
    if (value) return value;
    return defaultValue;
  },
  isString(value) {
    return typeof value === 'string';
  },
  isNumber(value) {
    return typeof value === 'number';
  },
  isBoolean(value) {
    return typeof value === 'boolean';
  },
  isList(value) {
    return Array.isArray(value);
  },
  isMap(value) {
    if (value instanceof Map) return value;
    return value != null && typeof value === 'object';
  },
  typeOf(value) {
    if (value === null) return 'Null';
    if (this.isList(value)) return 'List';
    if (this.isMap(value)) return 'Map';
    switch (typeof value) {
      case 'number':
        return 'Number';
      case 'string':
        return 'String';
      case 'boolean':
        return 'Boolean';
      default:
        return 'Object';
    }
  },
  matches(pattern, value) {
    return new RegExp(pattern).test(value);
  }
}