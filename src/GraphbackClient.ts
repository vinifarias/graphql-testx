import { createClient, ClientDocument, InputModelTypeContext } from "graphback";

interface StringDic {
  [key: string]: string;
}

/**
 * Inserts the implementations of the items of source into a destination as its
 * properties.
 * @param source An array containing operations and their implementation
 * @param destination An object with string properties and values
 */
function insertImplInto(
  source: ClientDocument[],
  destination: StringDic
): void {
  source.forEach(item => {
    destination[item.name] = item.implementation;
  });
}

export class GraphbackClient {
  private readonly queries: StringDic;
  private readonly mutations: StringDic;
  private readonly fragments: StringDic;
  private readonly subscriptions: StringDic;

  constructor(
    queries: StringDic,
    mutations: StringDic,
    fragments: StringDic,
    subscriptions: StringDic
  ) {
    this.queries = queries;
    this.mutations = mutations;
    this.fragments = fragments;
    this.subscriptions = subscriptions;
  }

  public getQueries(): StringDic {
    return this.queries;
  }

  public getMutations(): StringDic {
    return this.mutations;
  }

  public getFragments(): StringDic {
    return this.fragments;
  }

  public getSubscriptions(): StringDic {
    return this.subscriptions;
  }
}

export async function initGraphbackClient(
  context: InputModelTypeContext[]
): Promise<GraphbackClient> {
  const fragments: StringDic = {};
  const queries: StringDic = {};
  const mutations: StringDic = {};
  const subscriptions: StringDic = {};

  const client = await createClient(context, { output: "gql" });

  if (client.fragments !== undefined) {
    insertImplInto(client.fragments, fragments);
  }

  if (client.queries !== undefined) {
    insertImplInto(client.queries, queries);
  }

  if (client.mutations !== undefined) {
    insertImplInto(client.mutations, mutations);
  }

  if (client.subscriptions !== undefined) {
    insertImplInto(client.subscriptions, subscriptions);
  }

  return new GraphbackClient(queries, mutations, fragments, subscriptions);
}
