const neo4j = require('neo4j-driver');

let config = {};

/**
 * @type {Driver}
 */
let driver;

let multiDBSupport = false;

/**
 * Initialize Neo4j driver instance.
 * @param url {string}
 * @param user {string}
 * @param password {string}
 * @param database {string=} Database, default: 'neo4j'
 * @param options {Config=} neo4j-driver config options
 */
async function init(url, user, password, database = 'neo4j', options = {}) {

  config.url = url;
  config.auth = neo4j.auth.basic(user, password);
  config.database = database;
  config.options = Object.assign({disableLosslessIntegers: true}, options);

  driver = neo4j.driver(url, config.auth, config.options);

  process.on('exit', async () => {
    await driver.close();
  });

  try {

    const serverInfo = await driver.verifyConnectivity();

    console.log('Neo4j Server:', serverInfo);

    // check version
    const matches = /^Neo4j\/(\d+).\d+.\d+/.exec(serverInfo.version);
    if (+matches[1] > 3) {
      multiDBSupport = true;
    }

    return serverInfo;

  } catch (reason) {

    console.error('Neo4j driver instantiation failed', reason);
    return Promise.reject(reason);

  }

}

/**
 * READ transaction without modifying database.
 * @param query {string}
 * @param params {Object=}
 * @return {Promise<Object[]>}
 */
async function readTransaction(query, params = {}) {

  if (!driver) {
    return Promise.reject('Neo4j driver not initialized!');
  }

  const session = driver.session({
    database: multiDBSupport ? config.database : null,
    defaultAccessMode: neo4j.session.READ
  });

  try {

    const result = await session.readTransaction(tx => tx.run(query, params));
    return extractBoltRecords(result.records);

  } catch (e) {

    return Promise.reject(e);

  } finally {

    await session.close();

  }

}

/**
 * WRITE transaction that modifies database.
 * @param query {string}
 * @param params {Object=}
 * @return {Promise<Object[]>}
 */
async function writeTransaction(query, params = {}) {

  if (!driver) {
    return Promise.reject('Neo4j driver not initialized!');
  }

  const session = driver.session({
    database: multiDBSupport ? config.database: null
  });

  try {

    const result = await session.writeTransaction(tx => tx.run(query, params));
    return extractBoltRecords(result.records);

  } catch (e) {

    return Promise.reject(e);

  } finally {

    await session.close();

  }

}

/**
 * Call multiple statements in one transaction.
 * @param statements {Array<{statement: string, parameters: Object<key, *>}>}
 * @return {Promise<Object[][]>}
 */
async function multipleStatements(statements) {

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
      results.push(extractBoltRecords(result.records));
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
 * @param data {Record[]}
 * @return {Object[]}
 */
function extractBoltRecords(data) {

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
    })
    return obj;
  });

}

function convertValues(value) {

  // neo4j integers
  if (neo4j.isInt(value)) {
    if (neo4j.integer.inSafeRange(value)) {
      return value.toNumber();
    } else {
      return value.toString();
    }
  }

  // if (value instanceof neo4j.Date) {
  //   return value.toString();
  // }

  // neo4j Node object
  if (value instanceof neo4j.types.Node) {
    value = value.properties;
  }

  // recursive
  if (Array.isArray(value)) {
    return value.map(v => convertValues(v));
  }

  if (typeof value === 'object' && value !== null) {
    for (const key of Object.keys(value)) {
      value[key] = convertValues(value[key]);
    }
  }

  return value;

}

/**
 * Look for empty arrays returned by Neo4j and clean them, if there is `null` inside.
 *
 * Sometimes, if the cypher query contains `OPTIONAL MATCH node` in combination with  `collect({key: node.value}) AS values`, the resulting array may be filled with one object with `null` values: `[{key: null}]`. This method reduces the array to `[]` by calling `removeEmptyArrays(data, 'values', 'key')`.
 *
 * @param data {*[]}
 * @param arrayKey {string} Property key of the array to check
 * @param checkKey {string} Property key of first array element to check against `null`
 * @return {*[]}
 */
function removeEmptyArrays(data, arrayKey, checkKey) {

  for (let i = 0, l = data.length; i < l; i++) {

    if (data[i][arrayKey] && Array.isArray(data[i][arrayKey]) && data[i][arrayKey][0]) {

      if (data[i][arrayKey][0][checkKey] === null) {
        data[i][arrayKey] = [];
      }

    }

    for (let key in data[i]) {

      if (data[i].hasOwnProperty(key) && Array.isArray(data[i][key])) {
        removeEmptyArrays(data[i][key], arrayKey, checkKey);
      }

    }

  }

  return data;

}

module.exports = {
  init,
  readTransaction,
  writeTransaction,
  multipleStatements,
  extractBoltRecords,
  removeEmptyArrays
};
