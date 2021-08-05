import * as neo4j from 'neo4j-driver';
import { AuthToken, Config, Driver, Record, ServerInfo } from 'neo4j-driver';

interface IParams {
  [key: string]: any;
}

let config: {
  url: string,
  auth: AuthToken,
  database: string,
  options: Config
};

let driver: Driver;

let multiDBSupport = false;

/**
 * Initialize Neo4j driver instance.
 * @param url
 * @param user
 * @param password
 * @param database Database, default: 'neo4j'
 * @param options neo4j-driver config options
 */
async function init(url: string, user: string, password: string, database: string = 'neo4j', options: Config = {}): Promise<ServerInfo> {

  config = {
    url,
    auth: neo4j.auth.basic(user, password),
    database,
    options: Object.assign({ disableLosslessIntegers: true }, options)
  };

  try {

    const serverInfo = await connect(5);

    console.log('Neo4j Server:', serverInfo);

    // check version
    const matches = /^Neo4j\/(\d+).\d+.\d+/.exec(serverInfo.version);

    if (+matches[1] > 3) {

      multiDBSupport = true;

    }

    process.on('exit', async () => {

      await driver.close();

    });

    return serverInfo;

  } catch (reason) {

    return Promise.reject(reason);

  }

}

/**
 * Connection routine. Retry a few times if connection failed (e.g. on server/database startup).
 * @param numberOfTrials Number of connection trials every 5 seconds before returning an error.
 */
async function connect(numberOfTrials: number): Promise<ServerInfo> {

  driver = neo4j.driver(config.url, config.auth, config.options);

  try {

    return await driver.verifyConnectivity();

  } catch (reason) {

    if (numberOfTrials > 0) {

      console.warn('Neo4j driver instantiation failed. Retry in 5 seconds...');

      return new Promise(((resolve, reject) => {

        setTimeout(() => {

          connect(numberOfTrials - 1)
            .then(value => {

              resolve(value);

            })
            .catch(err => {

              reject(err);

            });

        }, 5000);

      }));

    } else {

      console.error('Neo4j driver instantiation failed!');

      return Promise.reject(reason);

    }

  }

}

/**
 * Get driver instance.
 */
function getDriver(): Driver {

  return driver;

}

/**
 * READ transaction without modifying database.
 */
async function readTransaction<T>(query: string, params: IParams = {}): Promise<T[]> {

  if (!driver) {

    return Promise.reject('Neo4j driver not initialized!');

  }

  const session = driver.session({
    database: multiDBSupport ? config.database : null,
    defaultAccessMode: neo4j.session.READ
  });

  try {

    const result = await session.readTransaction(tx => tx.run(query, params));

    return extractRecords<T>(result.records);

  } catch (e) {

    return Promise.reject(e);

  } finally {

    await session.close();

  }

}

/**
 * WRITE transaction that modifies database.
 */
async function writeTransaction<T >(query: string, params: IParams = {}): Promise<T[]> {

  if (!driver) {

    return Promise.reject('Neo4j driver not initialized!');

  }

  const session = driver.session({
    database: multiDBSupport ? config.database : null
  });

  try {

    const result = await session.writeTransaction(tx => tx.run(query, params));

    return extractRecords<T>(result.records);

  } catch (e) {

    return Promise.reject(e);

  } finally {

    await session.close();

  }

}

/**
 * Call multiple statements in one transaction.
 */
async function multipleStatements<T>(statements: {statement: string, parameters: IParams}[]): Promise<T[][]> {

  if (!driver) {

    return Promise.reject('Neo4j driver not initialized!');

  }

  const session = driver.session({
    database: multiDBSupport ? config.database : null
  });

  const txc = session.beginTransaction();

  try {

    const results = [];

    for (const s of statements) {

      const result = await txc.run(s.statement, s.parameters);

      results.push(extractRecords<T>(result.records));

    }

    await txc.commit();

    return results;

  } catch (e) {

    await txc.rollback();

    return Promise.reject(e);

  } finally {

    await session.close();

  }

}

/**
 * Extract and convert records returned by neo4j-driver.
 */
function extractRecords<T>(data: Record[]): T[] {

  if (!data) {

    return [];

  }

  if (!Array.isArray(data)) {

    return data;

  }

  return data.map(record => {

    const obj = {};

    record.keys.forEach(key => {

      obj[key] = convertValues(record.get(key));

    });

    return obj as T;

  });

}

function convertValues(value) {

  if (value === null) {

    return value;

  }

  // neo4j integers
  if (neo4j.isInt(value)) {

    if (neo4j.integer.inSafeRange(value)) {

      return value.toNumber();

    } else {

      return value.toString();

    }

  }

  // neo4j date, time, etc.
  if (neo4j.isDate(value) ||
    neo4j.isDateTime(value) ||
    neo4j.isLocalTime(value) ||
    neo4j.isLocalDateTime(value) ||
    neo4j.isTime(value) ||
    neo4j.isDuration(value) ||
    neo4j.isPoint(value)) {

    return value.toString();

  }

  // @ts-ignore neo4j Node object
  if (value instanceof neo4j.types.Node) {

    value = value.properties;

  }

  // recursive array
  if (Array.isArray(value)) {

    return value.map(v => convertValues(v));

  }

  // recursive object
  if (typeof value === 'object') {

    for (const key of Object.keys(value)) {

      value[key] = convertValues(value[key]);

    }

    return value;

  }

  return value;

}

/**
 * Look for empty arrays returned by Neo4j and clean them, if there is `null` inside.
 *
 * Sometimes, if the cypher query contains `OPTIONAL MATCH node` in combination with
 * `collect({key: node.value}) AS values`, the resulting array may be filled with one
 * object with `null` values: `[{key: null}]`. This method reduces the array to `[]`
 * by calling `removeEmptyArrays(data, 'values', 'key')`.
 *
 * @param data
 * @param arrayKey Property key of the array to check
 * @param checkKey Property key of first array element to check against `null`
 */
function removeEmptyArrays<T>(data: T[], arrayKey: string, checkKey: string): T[] {

  for (let i = 0, l = data.length; i < l; i++) {

    if (data[i][arrayKey] && Array.isArray(data[i][arrayKey]) && data[i][arrayKey][0]) {

      if (data[i][arrayKey][0][checkKey] === null) {

        data[i][arrayKey] = [];

      }

    }

    for (let key in data[i]) {

      if (data[i].hasOwnProperty(key) && Array.isArray(data[i][key])) {

        removeEmptyArrays(data[i][key] as any, arrayKey, checkKey);

      }

    }

  }

  return data;

}

export {
  init,
  getDriver,
  readTransaction,
  writeTransaction,
  multipleStatements,
  extractRecords,
  removeEmptyArrays
};
