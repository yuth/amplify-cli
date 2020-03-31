import cors from 'cors';
import e2p from 'event-to-promise';
import express from 'express';
import { execute, parse, specifiedRules, validate } from 'graphql';
import { address as getLocalIpAddress } from 'ip';
import { join } from 'path';
import portfinder from 'portfinder';
import { AmplifyAppSyncSimulator } from '..';
import { AppSyncSimulatorServerConfig } from '../type-definition';
import { extractJwtToken, getAuthorizationMode, extractHeader } from '../utils/auth-helpers';
import { exposeGraphQLErrors } from '../utils/expose-graphql-errors';
import { SubscriptionServer } from './subscription';

const MAX_BODY_SIZE = '10mb';
const BASE_PORT = 8900;
const MAX_PORT = 9999;

const STATIC_ROOT = join(__dirname, '..', '..', 'public');
export class OperationServer {
  private app: express.Application;
  private server;
  private connection;
  private port: number;
  url: string;

  constructor(
    private config: AppSyncSimulatorServerConfig,
    private simulatorContext: AmplifyAppSyncSimulator,
    private subscriptionServer: SubscriptionServer,
  ) {
    this.port = config.port;
    this.app = express();
    this.app.use(express.json({ limit: MAX_BODY_SIZE }));
    this.app.use(cors());
    this.app.post('/graphql', this.handleRequest.bind(this));
    this.app.get('/api-config', this.handleAPIInfoRequest.bind(this));
    this.app.use('/', express.static(STATIC_ROOT));
    this.server = null;
  }

  async start() {
    if (this.server) {
      throw new Error('Server is already running');
    }

    if (!this.port) {
      this.port = await portfinder.getPortPromise({
        startPort: BASE_PORT,
        stopPort: MAX_PORT,
      });
    }

    this.server = this.app.listen(this.port);

    return await e2p(this.server, 'listening').then(() => {
      this.connection = this.server.address();
      this.url = `http://${getLocalIpAddress()}:${this.connection.port}`;
      return this.server;
    });
  }

  stop() {
    if (this.server) {
      this.server.close();
      this.server = null;
      this.connection = null;
    }
  }

  private handleAPIInfoRequest(request: express.Request, response: express.Response) {
    return response.send(this.simulatorContext.appSyncConfig);
  }

  private async handleRequest(request: express.Request, response: express.Response) {
    try {
      const { headers } = request;
      let requestAuthorizationMode;
      try {
        requestAuthorizationMode = getAuthorizationMode(headers, this.simulatorContext.appSyncConfig);
      } catch (e) {
        return response.status(401).send({
          errors: [
            {
              errorType: 'UnauthorizedException',
              message: e.message,
            },
          ],
        });
      }

      const { variables = {}, query, operationName } = request.body;
      const doc = parse(query);

      if (!this.simulatorContext.schema) {
        return response.send({
          data: null,
          error: 'No schema available',
        });
      }
      const validationErrors = validate(this.simulatorContext.schema, doc, specifiedRules);
      if (validationErrors.length) {
        return response.send({
          errors: validationErrors,
        });
      }
      const {
        definitions: [{ operation: queryType }],
      } = doc as any; // Remove casting
      const authorization = extractHeader(headers, 'Authorization');
      const jwt = (authorization && extractJwtToken(authorization)) || {};
      const context = { jwt, requestAuthorizationMode, request, appsyncErrors: [] };
      switch (queryType) {
        case 'query':
        case 'mutation':
          const results: any = await execute(this.simulatorContext.schema, doc, null, context, variables, operationName);
          const errors = [...(results.errors || []), ...context.appsyncErrors];
          if (errors.length > 0) {
            results.errors = exposeGraphQLErrors(errors);
          }
          return response.send({ data: null, ...results });

        case 'subscription':
          const result = await execute(this.simulatorContext.schema, doc, null, context, variables, operationName);
          if (context.appsyncErrors.length) {
            const errors = exposeGraphQLErrors(context.appsyncErrors);
            return response.send({
              errors,
            });
          }
          const subscription = await this.subscriptionServer.register(doc, variables, context);
          return response.send({
            ...subscription,
            ...result,
          });
        default:
          throw new Error(`unknown operation type: ${queryType}`);
      }
    } catch (e) {
      console.log('Error while executing GraphQL statement', e);
      return response.send({
        errorMessage: e.message,
      });
    }
  }
}
