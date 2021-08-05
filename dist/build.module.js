import * as neo4j from 'neo4j-driver';

let config;
let driver;
let multiDBSupport = false;
async function init(url, user, password, database = 'neo4j', options = {}) {
    config = {
        url,
        auth: neo4j.auth.basic(user, password),
        database,
        options: Object.assign({ disableLosslessIntegers: true }, options)
    };
    try {
        const serverInfo = await connect(5);
        console.log('Neo4j Server:', serverInfo);
        const matches = /^Neo4j\/(\d+).\d+.\d+/.exec(serverInfo.version);
        if (+matches[1] > 3) {
            multiDBSupport = true;
        }
        process.on('exit', async () => {
            await driver.close();
        });
        return serverInfo;
    }
    catch (reason) {
        return Promise.reject(reason);
    }
}
async function connect(numberOfTrials) {
    driver = neo4j.driver(config.url, config.auth, config.options);
    try {
        return await driver.verifyConnectivity();
    }
    catch (reason) {
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
        }
        else {
            console.error('Neo4j driver instantiation failed!');
            return Promise.reject(reason);
        }
    }
}
function getDriver() {
    return driver;
}
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
        return extractRecords(result.records);
    }
    catch (e) {
        return Promise.reject(e);
    }
    finally {
        await session.close();
    }
}
async function writeTransaction(query, params = {}) {
    if (!driver) {
        return Promise.reject('Neo4j driver not initialized!');
    }
    const session = driver.session({
        database: multiDBSupport ? config.database : null
    });
    try {
        const result = await session.writeTransaction(tx => tx.run(query, params));
        return extractRecords(result.records);
    }
    catch (e) {
        return Promise.reject(e);
    }
    finally {
        await session.close();
    }
}
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
            results.push(extractRecords(result.records));
        }
        await txc.commit();
        return results;
    }
    catch (e) {
        await txc.rollback();
        return Promise.reject(e);
    }
    finally {
        await session.close();
    }
}
function extractRecords(data) {
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
        return obj;
    });
}
function convertValues(value) {
    if (value === null) {
        return value;
    }
    if (neo4j.isInt(value)) {
        if (neo4j.integer.inSafeRange(value)) {
            return value.toNumber();
        }
        else {
            return value.toString();
        }
    }
    if (neo4j.isDate(value) ||
        neo4j.isDateTime(value) ||
        neo4j.isLocalTime(value) ||
        neo4j.isLocalDateTime(value) ||
        neo4j.isTime(value) ||
        neo4j.isDuration(value) ||
        neo4j.isPoint(value)) {
        return value.toString();
    }
    if (value instanceof neo4j.types.Node) {
        value = value.properties;
    }
    if (Array.isArray(value)) {
        return value.map(v => convertValues(v));
    }
    if (typeof value === 'object') {
        for (const key of Object.keys(value)) {
            value[key] = convertValues(value[key]);
        }
        return value;
    }
    return value;
}
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

export { extractRecords, getDriver, init, multipleStatements, readTransaction, removeEmptyArrays, writeTransaction };
