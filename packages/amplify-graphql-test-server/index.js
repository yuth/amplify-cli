const { PubSub } = require('graphql-subscriptions');
const http = require('http');
const express = require('express');
const jwtDecode = require('jwt-decode');
const e2p = require('event-to-promise');
const mosca = require('@conduitvc/mosca');
const uuid = require('uuid');

const { wrapSchema } = require('./schemaWrapper');
const { SubscriptionServer } = require('./serverCore');

export class AppSyncTestServer {
  constructor(schema, resolver, ddbClient, port = 0, subscriptionPort = 0) {
    this.ddbClient = ddbClient;
    this.port = port;
    this.subscriptionPort = subscriptionPort;
    this.pubsub = new PubSub();
    this.schema = wrapSchema(schema);
  }
  stop() {}
  reload(schema, resolvers) {}
  startServer() {}
  _processSchema() {}
  _generateResolvers() {}
  _createSubscriptionServer() {}

  _startSubscriptionServer() {}

  _createSubscriptionServer() {
    this.mqttHTTP = http.createServer();
    this.mqttServer = new mosca.Server({
      backend: { type: 'memory' },
      interfaces: [],
      logger: {
        level: process.env.DEBUG ? 'debug' : 'error'
      }
    });
    this.mqttServer.attachHttpServer(mqttHTTP);
    this.subServer = new SubscriptionServer({
      this.schema,
      this.mqttServer,

    })
  }
}
