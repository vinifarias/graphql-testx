import { serial as test } from "ava";
import { request } from "graphql-request";
import gql from "graphql-tag";
import { TestxServer } from "./TestxServer";
import { CRUDService, GraphbackCRUDService } from "graphback";

const ITEM_MODEL = `
  type Item {
    id: ID!
    title: String!
  }
`;

test("test start() and close() methods", async t => {
  const server = new TestxServer({ schema: ITEM_MODEL });

  await server.start();
  const httpUrl = await server.httpUrl();
  t.assert(httpUrl);

  const queries = await server.getQueries();
  const result = await request(httpUrl, queries.findAllItems);
  t.assert(result.findAllItems.length === 0);

  await server.close();
  await t.throwsAsync(
    async () => {
      await request(httpUrl, queries.findAllItems);
    },
    null,
    "Should throw an error after closing the server (ECONNREFUSED)"
  );
});

test("should start the server after closing it", async t => {
  const server = new TestxServer({ schema: ITEM_MODEL });
  await server.start();
  const httpUrl = await server.httpUrl();
  const mutations = await server.getMutations();
  const queries = await server.getQueries();

  await request(httpUrl, mutations.createItem, { title: "test" });

  await server.close();
  await t.throwsAsync(
    async () => {
      await request(httpUrl, queries.findAllItems);
    },
    null,
    "Should throw an error after closing the server (ECONNREFUSED)"
  );

  await server.start();
  const result = await request(httpUrl, queries.findAllItems);
  t.assert(result.findAllItems.length === 0, "Should be empty");
});

test.skip("start multiple TestxServer servers at the same time", async t => {
  // Issue: https://github.com/aerogear/graphql-testx/issues/47
  const server1 = new TestxServer({ schema: ITEM_MODEL });
  const server2 = new TestxServer({ schema: ITEM_MODEL });

  // start both servers at the same time
  await Promise.all([server1.start(), server2.start()]);

  t.assert(true);
});

test("stop() method should preserve stored items", async t => {
  const server = new TestxServer({ schema: ITEM_MODEL });

  await server.start();
  const httpUrl = await server.httpUrl();
  const queries = await server.getQueries();
  const mutations = await server.getMutations();

  await request(httpUrl, mutations.createItem, { title: "test" });
  let result = await request(httpUrl, queries.findAllItems);
  t.assert(
    result.findAllItems.length === 1,
    "Created item should be successfully fetched"
  );

  await server.stop();

  await t.throwsAsync(
    async () => {
      await request(httpUrl, queries.findAllItems);
    },
    null,
    "Should throw an error after stopping the server (ECONNREFUSED)"
  );

  await server.start();
  result = await request(httpUrl, queries.findAllItems);
  t.assert(
    result.findAllItems.length === 1,
    "The item should be still present after resuming the server"
  );

  await server.close();
});

test("cleanDatabase() method should remove all items", async t => {
  const server = new TestxServer({ schema: ITEM_MODEL });

  await server.start();
  const httpUrl = await server.httpUrl();
  const queries = await server.getQueries();
  const mutations = await server.getMutations();

  await request(httpUrl, mutations.createItem, { title: "test" });
  let result = await request(httpUrl, queries.findAllItems);
  t.assert(
    result.findAllItems.length === 1,
    "Created item should be successfully fetched"
  );

  await server.cleanDatabase();

  result = await request(httpUrl, queries.findAllItems);
  t.assert(
    result.findAllItems.length === 0,
    "The item should be gone after calling cleanDatabase() method"
  );

  await server.close();
});

test("setData() should init DB with specified data and replace existing data", async t => {
  const server = new TestxServer({ schema: ITEM_MODEL });

  await server.start();
  const httpUrl = await server.httpUrl();
  const queries = await server.getQueries();
  const mutations = await server.getMutations();

  await request(httpUrl, mutations.createItem, { title: "test" });
  let result = await request(httpUrl, queries.findAllItems);
  t.assert(
    result.findAllItems.length === 1,
    "Created item should be successfully fetched"
  );

  const dataToSet = [
    { id: "0", title: "foo" },
    { id: "1", title: "bar" }
  ];
  await server.setData({
    item: dataToSet
  });
  result = await request(httpUrl, queries.findAllItems);
  t.deepEqual(
    result.findAllItems,
    dataToSet,
    "Only items created with setData() method should be fetched"
  );

  await server.close();
});

test("getGraphQLSchema() method should produce GQL schema with required definitions", async t => {
  const server = new TestxServer({ schema: ITEM_MODEL });
  const defsToBeGenerated = [
    "Item",
    "ItemInput",
    "ItemFilter",
    "Query",
    "Mutation",
    "Subscription"
  ];

  await server.start();
  const schema = await server.getGraphQlSchema();
  t.assert(typeof schema === "string");

  const parsedSchema = gql`
    ${schema}
  `;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const definitions = parsedSchema.definitions.map((d: any) => d.name.value);
  t.deepEqual(definitions, defsToBeGenerated);

  await server.close();
});

test("getDatabaseSchema() method should return column names for all types to be stored at DB", async t => {
  const server = new TestxServer({ schema: ITEM_MODEL });
  const itemDbSchema = ["id", "title", "created_at", "updated_at"];

  await server.start();
  const dbSchema = await server.getDatabaseSchema();
  t.assert(dbSchema["item"]);
  t.deepEqual(dbSchema["item"], itemDbSchema);

  await server.close();
});

test("overwrite default GraphbackCRUDService using serviceBuilder option", async t => {
  class TestService extends CRUDService {
    public async findAll(): Promise<unknown[]> {
      return Promise.resolve([{ id: 1, title: "Overwritten" }]);
    }
  }

  const server = new TestxServer({
    schema: ITEM_MODEL,
    serviceBuilder: (data, sub): GraphbackCRUDService =>
      new TestService(data, sub)
  });

  await server.start();
  const httpUrl = await server.httpUrl();
  const queries = await server.getQueries();

  const result = await request(httpUrl, queries.findAllItems);
  t.assert(result.findAllItems.length === 1);
  t.assert(result.findAllItems[0].title === "Overwritten");
});
