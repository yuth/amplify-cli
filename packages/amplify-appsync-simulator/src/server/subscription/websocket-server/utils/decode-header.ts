import { IncomingMessage } from 'http';
import { parse } from 'url';
export function decodeHeaderFromQueryParam(request: IncomingMessage): Record<string, any> {
  const url = parse(request.url);
  const params = new URLSearchParams(url.query);
  const base64Header = params.get('header');
  if (!base64Header) {
    return {};
  }
  return JSON.parse(Buffer.from(base64Header, 'base64').toString('utf8'));
}
