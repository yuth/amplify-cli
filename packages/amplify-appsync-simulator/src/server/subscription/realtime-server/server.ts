import { DocumentNode } from 'graphql';
import * as WebSocket from 'ws';
import { Server as WebSocketServer, ServerOptions, MessageEvent } from 'ws';
import { IncomingMessage } from 'http';
import { MESSAGE_TYPES } from './message-types';
import { GQLMessageConnectionInit, GQLMessageSubscriptionStart, isSubscriptionConnectionInitMessage } from './message-type-guards';

const PROTOCOL = 'graphql-ws';
const KEEP_ALIVE_TIMEOUT = 4 * 60 * 1000; // Wait time between Keep Alive Message
// Max time the client will wait for Keep Alive message before disconnecting. Sent to the client as part of connection ack
const CONNECTION_TIMEOUT_DURATION = 5 * 60 * 1000;

export type RealtimeSubscription = {
  id: string;
  // socket: WebSocketStream;
  subscription: {
    type: 'WebSocket';
    context: any;
    variables: Record<string, any>;
    asyncIterator: AsyncIterator<any>;
    document: DocumentNode;
  };
};

export type ConnectionContext = {
  socket: WebSocket;
  request: IncomingMessage;
  subscriptions: Record<string, RealtimeSubscription>;
  isConnectionInitialized: boolean;
};

export type RealTimeServerOptions = {
  onConnectHandler?: (message: GQLMessageConnectionInit, header: Record<string, string[]>) => void;
  onSubscribeHandler: (message: GQLMessageSubscriptionStart) => void;
  keepAlive?: number;
  connectionTimeoutDuration?: number;
};

const DEFAULT_OPTIONS: Partial<RealTimeServerOptions> = {
  onConnectHandler: () => {},
  keepAlive: KEEP_ALIVE_TIMEOUT,
  connectionTimeoutDuration: CONNECTION_TIMEOUT_DURATION,
};

export class RealTimeServer {
  private options: RealTimeServerOptions;
  private connections: Set<ConnectionContext>;
  private webSocketServer: WebSocketServer;

  constructor(options: RealTimeServerOptions, server?: ServerOptions) {
    this.connections = new Set();
    this.options = { ...DEFAULT_OPTIONS, ...options };
    if (server) {
      this.attachWebServer(server);
    }
  }

  attachWebServer(serverOptions: ServerOptions): void {
    this.webSocketServer = new WebSocketServer(serverOptions || {});
  }
  start() {
    if (!this.webSocketServer) {
      throw new Error('No server is attached');
    }
    this.webSocketServer.on('connection', this.onSocketConnection);
  }

  stop() {
    if (this.webSocketServer) {
      this.webSocketServer.off('connection', this.onSocketConnection);
      this.connections.forEach(connection => {
        this.onClose(connection);
      });
      this.webSocketServer.close();
    }
  }

  private onClose(connectionContext: ConnectionContext): void {
    Object.keys(connectionContext.subscriptions).forEach(subscriptionId => {
      this.unSubscribe(connectionContext, subscriptionId);
    });
    this.connections.delete(connectionContext);
  }

  private unSubscribe(connectionContext: ConnectionContext, id: string): void {
    if (connectionContext.subscriptions && connectionContext.subscriptions[id]) {
      if (connectionContext.subscriptions[id].subscription.asyncIterator) {
        connectionContext.subscriptions[id].subscription.asyncIterator.return();
      }

      delete connectionContext.subscriptions[id];
    }
  }

  private onSocketConnection(socket: WebSocket, request: IncomingMessage): void {
    (socket as any).upgradeReq = request;
    if (typeof socket.protocol === 'undefined' || socket.protocol !== PROTOCOL) {
      socket.close(1002); // protocol error
      return;
    }
    const connectionContext: ConnectionContext = {
      request,
      socket,
      subscriptions: {},
      isConnectionInitialized: false,
    };
    this.connections.add(connectionContext);
    const onMessage = message => {
      this.onMessage(connectionContext, message);
    };
    const onClose = (error?: Error | string) => {
      socket.off('message', onMessage);
      socket.off('close', onClose);
      socket.off('error', onClose);
      this.onSocketDisconnection(connectionContext, error);
    };

    socket.on('message', onMessage);
    socket.on('close', onClose);
    socket.on('error', onClose);
  }

  private onSocketDisconnection(connectionContext: ConnectionContext, error?: Error | string): void {
    this.onClose(connectionContext);
    if (error) {
      this.sendError(connectionContext, '', { message: error instanceof Error ? error.message : error });
      setTimeout(() => {
        // 1011 is an unexpected condition prevented the request from being fulfilled
        connectionContext.socket.close(1011);
      }, 10);
    }
  }

  private onMessage(connectionContext: ConnectionContext, message: any) {}

  private sendMessage(connectionContext: ConnectionContext, subscriptionId: string, type: MESSAGE_TYPES, data: any): void {
    const message = {
      type,
      id: subscriptionId,
      payload: data,
    };
    if (connectionContext.socket.readyState === WebSocket.OPEN) {
      connectionContext.socket.send(JSON.stringify(message));
    } else {
      throw new Error('Cant send message to a closed connection');
    }
  }
  private sendError(
    connectionContext: ConnectionContext,
    subscriptionId: string,
    errorPayload: any,
    type: MESSAGE_TYPES.GQL_ERROR | MESSAGE_TYPES.GQL_CONNECTION_ERROR = MESSAGE_TYPES.GQL_ERROR,
  ) {
    if ([MESSAGE_TYPES.GQL_CONNECTION_ERROR, MESSAGE_TYPES.GQL_ERROR].indexOf(type) === -1) {
      throw new Error(`Message type should for error should be one of ${MESSAGE_TYPES.GQL_ERROR} or ${MESSAGE_TYPES.GQL_CONNECTION_ERROR}`);
    }
    this.sendMessage(connectionContext, subscriptionId, type, errorPayload);
  }
  private sendPing(connectionContext: ConnectionContext): void {
    this.sendMessage(connectionContext, undefined, MESSAGE_TYPES.GQL_CONNECTION_KEEP_ALIVE, undefined);
  }

  private async onConnectionInit(connectionContext: ConnectionContext, message): void {
    connectionContext.isConnectionInitialized = true;
    try {
      if (isSubscriptionConnectionInitMessage(message)) {
      } else {
        const error = new Error('Malformed message');
        error.name = 'MalformedMessage';
        throw error;
      }
      this.sendMessage(connectionContext, undefined, MESSAGE_TYPES.GQL_CONNECTION_ACK, undefined);
      this.sendPing(connectionContext);
      // Regular keep alive messages if keepAlive is set
      const pingTimer = setInterval(() => {
        if (connectionContext.socket.readyState === WebSocket.OPEN) {
          this.sendPing(connectionContext);
        } else {
          clearInterval(pingTimer);
        }
      }, KEEP_ALIVE_TIMEOUT);
    } catch (e) {
      this.sendError(connectionContext, '', {
        errors: [
          {
            errorType: e.name,
            message: e.message,
          },
        ],
      });
    }
  }

  private onConnectionTermination(connectionContext: ConnectionContext): void {
    connectionContext.socket.close();
  }
  private onSubscriptionStart(connectionContext: ConnectionContext, message): void {
    this.onNewSubscription();
  }
}
