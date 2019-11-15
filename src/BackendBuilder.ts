import {
  DatabaseSchemaManager,
  GraphQLBackendCreator,
  IGraphQLBackend,
} from "graphback";
import { transpile } from "typescript";
import { sourceModule } from "./utils";

export class BackendBuilder {
  private model: string;
  private config: { [id: string]: any };
  private backendCreator: GraphQLBackendCreator;
  private backend: IGraphQLBackend;

  constructor(model: string, config: { [id: string]: any }) {
    this.model = model;
    this.config = config;
  }

  public async generateBackend() {
    await this.init();
    const typeDefs = await this.generateTypeDefs();
    const resolvers = await this.generateResolvers();
    const dbConnection = await this.generateDatabase();
    const {
      clientQueries,
      clientMutations,
    } = await this.generateClientQueriesAndMutations();
    return {
      typeDefs,
      resolvers,
      dbConnection,
      clientQueries,
      clientMutations,
    };
  }

  private async init() {
    this.backendCreator = new GraphQLBackendCreator(this.model, this.config);
    this.backend = await this.backendCreator.createBackend("sqlite3");
  }

  private async generateTypeDefs() {
    const { typeDefs } = sourceModule(transpile(this.backend.schema));
    return typeDefs;
  }

  private async generateResolvers() {
    const modules: { [id: string]: any } = {};

    this.backend.resolvers.types.map((item) => {
      modules[`./generated/${item.name}`] = sourceModule(
        transpile(item.output),
      );
    });

    const { resolvers } = sourceModule(
      transpile(this.backend.resolvers.index),
      modules,
    );

    return resolvers;
  }

  private async generateDatabase() {
    const manager = new DatabaseSchemaManager("sqlite3", {
      filename: ":memory:",
    });
    this.backendCreator.registerDataResourcesManager(manager);
    await this.backendCreator.createDatabase();
    return manager.getConnection();
  }

  private async generateClientQueriesAndMutations() {
    const modules: { [id: string]: any } = {};

    const {
      fragments,
      queries,
      mutations,
    } = await this.backendCreator.createClient();

    fragments.map((item) => {
      modules[`../fragments/${item.name}`] = sourceModule(
        transpile(item.implementation),
      );
    });

    const clientQueries = {};
    queries.map((item) => {
      clientQueries[item.name] = sourceModule(
        transpile(item.implementation),
        modules,
      )[item.name];
    });

    const clientMutations = {};
    mutations.map((item) => {
      clientMutations[item.name] = sourceModule(
        transpile(item.implementation),
        modules,
      )[item.name];
    });

    return { clientQueries, clientMutations };
  }
}
