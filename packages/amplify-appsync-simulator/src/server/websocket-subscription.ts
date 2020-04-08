import { createServer as createHTTPServer, IncomingMessage, Server } from 'http';
import { DocumentNode } from 'graphql';
import { extractHeader, extractJwtToken, getAuthorizationMode } from '../utils/auth-helpers';
import { AppSyncGraphQLExecutionContext } from '../utils/graphql-runner';
import { runSubscription, SubscriptionResult } from '../utils/graphql-runner/subscriptions';
import { AmplifyAppSyncSimulator } from '..';
import { ConnectionContext, WebsocketSubscriptionServer } from './subscription/websocket-server/server';

export class AppSyncSimulatorSubscriptionServer {
  private realtimeServer: WebsocketSubscriptionServer;
  constructor(
    private appSyncServerContext: AmplifyAppSyncSimulator,
    private server: Server,
    private subscriptionPath: string = '/subscribe',
  ) {
    this.realtimeServer = new WebsocketSubscriptionServer(
      {
        onSubscribeHandler: this.onSubscribe.bind(this),
        onConnectHandler: this.onConnectHandler.bind(this),
      },
      {
        server: this.server,
        path: this.subscriptionPath,
      },
    );
  }
  start() {
    this.realtimeServer.start();
  }
  stop() {
    this.realtimeServer.stop();
  }

  async onSubscribe(
    doc: DocumentNode,
    variable: Record<string, any>,
    headers: Record<string, any>,
    request: IncomingMessage,
    operationName?: string,
  ) {
    const ipAddress = request.socket.remoteAddress;
    const authorization = extractHeader(headers, 'Authorization');
    const jwt = extractJwtToken(authorization);
    const requestAuthorizationMode = getAuthorizationMode(headers, this.appSyncServerContext.appSyncConfig);
    const executionContext: AppSyncGraphQLExecutionContext = {
      jwt,
      sourceIp: ipAddress,
      headers,
      requestAuthorizationMode,
      appsyncErrors: [],
    };
    const subscriptionResult = await runSubscription(this.appSyncServerContext.schema, doc, variable, operationName, executionContext);
    if ((subscriptionResult as SubscriptionResult).asyncIterator) {
      return (subscriptionResult as SubscriptionResult).asyncIterator;
    }
    return subscriptionResult;
  }

  onConnectHandler(message: ConnectionContext, headers: Record<string, any>) {
    this.authorizeRequest(headers);
  }

  authorizeRequest(headers: Record<string, string>): void {
    getAuthorizationMode(headers, this.appSyncServerContext.appSyncConfig);
  }
}
