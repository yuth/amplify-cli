import { subscribe, DocumentNode, ExecutionResult, ExecutableDefinitionNode, FieldNode, execute, parse } from 'graphql';
import crypto from 'crypto';
import { inspect } from 'util';
import { createServer as createHTTPServer, Server, IncomingMessage } from 'http';
import e2p from 'event-to-promise';
import portfinder from 'portfinder';
import chalk from 'chalk';

import { Server as CoreHTTPServer, AddressInfo } from 'net';
import { Server as MQTTServer } from './subscription/mqtt-server';
import { address as getLocalIpAddress } from 'ip';

import { AmplifyAppSyncSimulator } from '..';
import { AppSyncSimulatorServerConfig } from '../type-definition';
import { getAuthorizationMode, extractJwtToken } from '../utils/auth-helpers';
import { RealTimeServer, ConnectionContext } from './subscription/realtime-server/server';
import { AppSyncGraphQLExecutionContext } from '../utils/graphql-runner';
import { runSubscription } from '../utils/graphql-runner/subscriptions';

const MINUTE = 1000 * 60;
const CONNECTION_TIME_OUT = 2 * MINUTE; // 2 mins
const TOPIC_EXPIRATION_TIMEOUT = 60 * MINUTE; // 60 mins
const BASE_PORT = 8900;
const MAX_PORT = 9999;

const log = console;

export type GraphQLClientSubscription = {
  type: 'MQTT' | 'WebSocket';
  context: any;
  variables: Record<string, any>;
  topicId: string;
  asyncIterator: AsyncIterator<any>;
  document: DocumentNode;
  isRegistered: boolean;
};
export class SubscriptionServer {
  private clientRegistry: Map<string, GraphQLClientSubscription[]>;
  private mqttIteratorTimeout: Map<string, NodeJS.Timer>;
  private mqttWebSocketServer: Server;
  private mqttServer: MQTTServer;
  private realtimeServer: RealTimeServer;
  private realtimeSocketServer: Server;
  url: string;
  private port: number;

  constructor(private config: AppSyncSimulatorServerConfig, private appSyncServerContext: AmplifyAppSyncSimulator) {
    this.port = config.wsPort;
    this.mqttWebSocketServer = createHTTPServer();

    this.mqttServer = new MQTTServer({
      logger: {
        level: process.env.DEBUG ? 'debug' : 'error',
      },
    });
    this.mqttServer.attachHttpServer(this.mqttWebSocketServer);
    this.clientRegistry = new Map();
    this.mqttIteratorTimeout = new Map();

    this.mqttServer.on('clientConnected', this.afterMQTTClientConnect.bind(this));

    this.mqttServer.on('clientDisconnected', this.afterMQTTClientDisconnect.bind(this));

    this.mqttServer.on('subscribed', this.afterSubscription.bind(this));

    this.mqttServer.on('unsubscribed', this.afterMQTTClientUnsubscribe.bind(this));

    this.realtimeSocketServer = createHTTPServer();
    this.realtimeServer = new RealTimeServer(
      {
        onSubscribeHandler: (
          doc: DocumentNode,
          variable: Record<string, any>,
          headers: Record<string, any>,
          request: IncomingMessage,
          operationName?: string,
        ) => {
          const ipAddress = request.socket.remoteAddress;
          const jwt = extractJwtToken(headers.authorization);
          const requestAuthorizationMode = getAuthorizationMode(headers, this.appSyncServerContext.appSyncConfig);
          const executionContext: AppSyncGraphQLExecutionContext = {
            jwt,
            sourceIp: ipAddress,
            headers,
            requestAuthorizationMode,
          };
          return runSubscription(this.appSyncServerContext.schema, doc, variable, operationName, executionContext);
        },
        onConnectHandler: (message: ConnectionContext, headers: Record<string, any>) => {
          this.checkAuthorization(headers);
        },
      },
      {
        server: this.realtimeSocketServer,
        path: '/realtime',
      },
    );
  }

  async start() {
    if (!this.port) {
      this.port = await portfinder.getPortPromise({
        startPort: BASE_PORT,
        stopPort: MAX_PORT,
      });
    }
    const server = this.mqttWebSocketServer.listen(this.port);
    this.realtimeSocketServer.listen(20004);
    this.realtimeServer.start();

    return await e2p(server, 'listening').then(() => {
      const address = server.address() as AddressInfo;
      this.url = `ws://${getLocalIpAddress()}:${address.port}/`;
      return server;
    });
  }

  stop() {
    if (this.mqttWebSocketServer) {
      this.mqttWebSocketServer.close();
      this.url = null;
      this.mqttWebSocketServer = null;
    }
  }

  async afterMQTTClientConnect(client) {
    const { id: clientId } = client;
    log.info(`Client (${chalk.bold(clientId)}) connected to subscription server`);
    const timeout = this.mqttIteratorTimeout.get(client.id);
    if (timeout) {
      clearTimeout(timeout);
    }
  }

  async afterSubscription(topic, client) {
    const { id: clientId } = client;
    log.info(`Client (${chalk.bold(clientId)}) subscribed to topic ${topic}`);
    const regs = this.clientRegistry.get(clientId);
    if (!regs) {
      log.error(`No registration for client (${chalk.bold(clientId)})`);
      return;
    }

    const reg = regs.find(({ topicId }) => topicId === topic);
    if (!reg) {
      log.error(`Client (${chalk.bold(clientId)}) tried to subscribe to non-existent topic ${topic}`);
      return;
    }

    if (!reg.isRegistered) {
      // turn the subscription back on
      this.register(reg.document, reg.variables, reg.context);
    }

    const { asyncIterator, topicId } = reg;

    while (true) {
      let { value: payload } = await asyncIterator.next();
      log.info(`Publishing payload for topic ${topicId}`);
      log.log('Payload:');
      log.log(inspect(payload));
      this.mqttServer.publish({
        topic: topicId,
        payload: JSON.stringify(payload),
        qos: 0,
        retain: false,
      });
    }
  }

  afterMQTTClientUnsubscribe(topic, client) {
    const { id: clientId } = client;
    log.info(`Client (${chalk.bold(clientId)}) unsubscribed from topic ${topic}`);
    const registration = this.clientRegistry.get(clientId);
    if (!registration) {
      log.error(`No registration for client (${chalk.bold(clientId)})`);
      return;
    }

    const reg = registration.find(({ topicId }) => topicId === topic);
    if (!reg) {
      log.error(`Client (${chalk.bold(clientId)}) tried to unsubscribe from non-existent topic ${topic}`);
      return;
    }

    // turn off subscription, but keep registration so client
    // can resubscribe
    reg.asyncIterator.return();
    reg.isRegistered = false;
  }

  afterMQTTClientDisconnect(client) {
    const { id: clientId } = client;
    log.info(`Client (${chalk.bold(clientId)}) disconnected`);
    const reg = this.clientRegistry.get(clientId);
    if (!reg) {
      log.error(`Unregistered client (${chalk.bold(clientId)}) disconnected`);
    }
    // kill all the subscriptions as the client has already disconnected
    reg.forEach(subscription => {
      subscription.asyncIterator.return();
    });
    this.clientRegistry.delete(clientId);
  }

  async register(document: DocumentNode, variables: Record<string, any>, context) {
    const connection = context.request.connection;
    const remoteAddress = `${connection.remoteAddress}:${connection.remotePort}`;
    const clientId = crypto
      .createHash('MD5')
      .update(remoteAddress)
      .digest()
      .toString('hex');

    // move next line to a helper function
    const subscriptionName = ((document.definitions[0] as ExecutableDefinitionNode).selectionSet.selections.find(
      s => s.kind === 'Field',
    ) as FieldNode).name.value;
    const paramHash =
      variables && Object.keys(variables).length
        ? crypto
            .createHash('MD5')
            .update(JSON.stringify(variables))
            .digest()
            .toString('hex')
        : null;
    const topicId = [clientId, subscriptionName, paramHash].join('/');

    log.info(`Client (${chalk.bold(clientId)}) registered for topic ${topicId}`);

    const asyncIterator = await this.subscribeToGraphQL(document, variables, context);

    if ((asyncIterator as ExecutionResult).errors) {
      return {
        errors: context.appsyncErrors || (asyncIterator as ExecutionResult).errors,
        data: (asyncIterator as ExecutionResult).data || null,
      };
    }
    const registration: GraphQLClientSubscription = {
      type: 'MQTT',
      context,
      document,
      variables,
      topicId,
      asyncIterator: asyncIterator as AsyncIterableIterator<ExecutionResult>,
      isRegistered: true,
    };

    const currentRegistrations = this.clientRegistry.get(clientId) || [];
    const existingSubscription = currentRegistrations.find(reg => reg.topicId === topicId);
    if (!existingSubscription) {
      // New subscription request
      currentRegistrations.push(registration);

      this.clientRegistry.set(clientId, currentRegistrations);

      // if client does not connect within this amount of time then end iterator.
      this.mqttIteratorTimeout.set(
        clientId,
        setTimeout(() => {
          (asyncIterator as AsyncIterator<ExecutionResult>).return();
          this.mqttIteratorTimeout.delete(clientId);
        }, CONNECTION_TIME_OUT),
      );
    } else {
      // reusing existing subscription. Client unsubscribed to the topic earlier but
      // the socket connection is still present
      // No timeout needed as client is already connected
      Object.assign(existingSubscription, registration);
    }

    return {
      extensions: {
        subscription: {
          mqttConnections: [
            {
              url: this.url,
              topics: currentRegistrations.map(reg => reg.topicId),
              client: clientId,
            },
          ],
          newSubscriptions: {
            [subscriptionName]: {
              topic: topicId,
              expireTime: Date.now() + TOPIC_EXPIRATION_TIMEOUT,
            },
          },
        },
      },
    };
  }

  subscribeToGraphQL(document: DocumentNode, variables: object, context: any, operationName?: string) {
    return subscribe({
      schema: this.appSyncServerContext.schema,
      document,
      variableValues: variables,
      contextValue: context,
      operationName,
    });
  }

  private checkAuthorization(headers: Record<string, string>): boolean {
    getAuthorizationMode(headers, this.appSyncServerContext.appSyncConfig);
    return true;
  }
}
