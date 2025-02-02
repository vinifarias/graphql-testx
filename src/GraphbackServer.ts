import { ApolloServer, PubSub } from "apollo-server-express";
import newExpress from "express";
import {
  GraphbackDataProvider,
  GraphbackCRUDService,
  InputModelTypeContext,
  SchemaGenerator,
  CRUDService,
  LayeredRuntimeResolverGenerator
} from "graphback";
import { Server, createServer } from "http";
import { getAvailablePort } from "./utils";

const ENDPOINT = "/graphql";

export interface ServiceBuilder {
  (data: GraphbackDataProvider, sub: PubSub):
    | Promise<GraphbackCRUDService>
    | GraphbackCRUDService;
}

export class GraphbackServer {
  private readonly graphqlSchema: string;
  private readonly httpServer: Server;
  private serverPort?: number;

  constructor(httpServer: Server, graphqlSchema: string) {
    this.httpServer = httpServer;
    this.graphqlSchema = graphqlSchema;
  }

  public async start(port?: number): Promise<void> {
    if (port === undefined) {
      // if no port is passed, use the previous port
      // or get a new available port
      if (this.serverPort !== undefined) {
        port = this.serverPort;
      } else {
        port = await getAvailablePort();
      }
    }

    this.httpServer.listen({ port });
    this.serverPort = port;
  }

  public async stop(): Promise<void> {
    const server = this.httpServer;
    if (!server.listening) {
      return;
    }

    // convert server close to a promise
    await new Promise((resolve, reject) => {
      server.close(e => {
        if (e) {
          reject(e);
        } else {
          resolve();
        }
      });
    });
  }

  public getHttpUrl(): string {
    if (this.serverPort === undefined) {
      throw new Error(
        `can not retrieve the httpUrl because the server has not been started yet`
      );
    }

    return `http://localhost:${this.serverPort}${ENDPOINT}`;
  }

  public getWsUrl(): string {
    if (this.serverPort === undefined) {
      throw new Error(
        `can not retrieve the subscriptions url because the server has not been started yet`
      );
    }

    return `ws://localhost:${this.serverPort}${ENDPOINT}`;
  }

  public getSchema(): string {
    return this.graphqlSchema;
  }
}

export async function initGraphbackServer(
  context: InputModelTypeContext[],
  data: GraphbackDataProvider,
  serviceBuilder?: ServiceBuilder
): Promise<GraphbackServer> {
  const schemaGenerator = new SchemaGenerator(context);
  const schema = schemaGenerator.generate();

  const sub = new PubSub();

  const service: GraphbackCRUDService = serviceBuilder
    ? await serviceBuilder(data, sub)
    : new CRUDService(data, sub);

  const resolverGenerator = new LayeredRuntimeResolverGenerator(
    context,
    service
  );
  const resolvers = resolverGenerator.generate();

  const express = newExpress();

  const apollo = new ApolloServer({
    typeDefs: schema,
    resolvers: resolvers
  });

  apollo.applyMiddleware({ app: express, path: ENDPOINT });

  const httpServer = createServer(express);
  apollo.installSubscriptionHandlers(httpServer);

  return new GraphbackServer(httpServer, schema);
}
