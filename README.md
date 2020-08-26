# neo4j-request

A wrapper for the official [neo4j-driver](https://github.com/neo4j/neo4j-javascript-driver) that simplifies the execution of cypher queries by encapsulating session opening and closing as well as transaction handling in respective methods.
The queried records are extracted to a simplified format, non-standard properties (e.g. dates) are converted.

Currently, this package only makes use of the Promise API of neo4j-driver.
Features like the Streaming API or bookmarks are not yet implemented.

## Installation

Via npm:

    npm install neo4j-request

## Usage

Import:

```javascript
const neo4j = require('neo4j-request');
// or
import * as neo4j from 'neo4j-request';
```

### init

Before doing any transaction, the neo4j-driver needs to be initialized once.
The driver instance is set globally, such that you can import `neo4j-request` in any other module without the need to initialize again.
If the node application closes, the driver gets closed as well.

If the Neo4j instance is unavailable, connection is not possible.
Driver instantiation will be re-invoked a few times before throwing an error (useful in cases like server startup when node application is live earlier than the Neo4j database instance).

For detailed `options` refer to [neo4j-driver](https://github.com/neo4j/neo4j-javascript-driver).

```javascript
neo4j.init(url, user, password, database = 'neo4j', options = {disableLosslessIntegers: true});
```

|Param|Details|
|---|---|
|`url`|_Type:_ `string` <br> Usually something like  `neo4j://localhost`.|
|`user`|_Type:_ `string`|
|`password`|_Type:_ `string`|
|`database` <br> _(optional)_|_Type:_ `string` <br> _Default: `neo4j`_ <br> If using Neo4j 3.x, this information gets ignored.|
|`options` <br> _(optional)_|_Type:_ `Object` <br> For details refer to [neo4j-driver](https://github.com/neo4j/neo4j-javascript-driver).

Returns `Promise<ServerInfo>`.

### readTransaction

A very simple read transaction that expects a cypher statement and (optionally) query parameters.

|Param|Details|
|---|---|
|`query`|_Type:_ `string`|
|`params` <br> _(optional)_|_Type:_ `Object<string, any>`|

Returns `Promise<Object[]>`: an array of objects, where the object's property names correlate with identifiers within the `RETURN` clause.

```javascript
const query = `
  MATCH (p:Person {name: $name})-[:HAS_ADDRESS]->(add:Address)
  RETURN p.name AS name, add AS address
`;

const params = {
  name: 'Alex'
};

try {
  
  const results = await neo4j.readTransaction(query, params);
  console.log(results);
  
} catch (e) {
  
  // handle error
  
}

// console.log(results)
// [
//   {
//     name: 'Alex',
//     address: {
//       ZIP: '10178',
//       number: '1',
//       town: 'Berlin',
//       street: 'Alexanderplatz'
//     }
//   }
// ]
```

### writeTransaction

Very similar to `readTransaction` (see for details) except that it expects a cypher statement that modifies the database.

### multipleStatements

Execute multiple cypher queries within one transaction.
A fail of one statement will lead to the rollback of the whole transaction.

|Param|Details|
|---|---|
|`statements`|_Type:_ `Array<{statement: string, parameters: Object<string, any>}>`|

Returns `Promise<Object[][]>`: an array of arrays similar to `readTransaction`.

```javascript

const statements = [{
  statement: `CREATE ...`,
  parameters: {}
}, {
  statement: `MATCH ... CREATE (n:Node $map) ...`,
  parameters: { map: { value: 'foo' } }
}];

try {
  
  const results = await neo4j.multipleStatements(statements);
  // handle results
  
} catch (e) {
  
  // handle error
  
}
```

### getDriver

Get the driver instance to access full API of [neo4j-driver](https://github.com/neo4j/neo4j-javascript-driver).

```javascript
const driver = neo4j.getDriver();
```

### extractRecords

Used internally to extract and convert the returned records by neo4j-driver to a more simplified format.
It converts non-standard values, like date, time, etc., to strings as well as Neo4j integers, if they are outside of the safe range.

Takes an array of records `Record[]` and returns an array of objects `Object[]`.

```javascript
const query = `
  MATCH (p:Person {name: "Alex"})-[:HAS_ADDRESS]->(add:Address)
  RETURN p.name AS name, add AS address
`;

// query results returned by neo4j-driver
// {
//   records: [
//     Record {
//       keys: [ 'name', 'address' ],
//       length: 2,
//       _fields: [
//         'Alex',
//         Node {
//           identity: 1,
//           labels: [ 'Address' ],
//           properties: {
//             ZIP: '10178',
//             number: '1',
//             town: 'Berlin',
//             street: 'Alexanderplatz'
//           }
//         }
//       ]
//       _fieldLookup: { name: 0, address: 1 }
//     }
//   ],
//   summary: ResultSummary {...}
// }

extractRecords(queryResults.records);

// simplified records returned by neo4j-request
// {
//   name: 'Alex',
//   address: {
//     ZIP: '10178',
//     number: '1',
//     town: 'Berlin',
//     street: 'Alexanderplatz'
//   }
// }
```

### removeEmptyArrays

Look for empty arrays returned by Neo4j and clean them, if there is `null` inside.

Sometimes, if the cypher query contains `OPTIONAL MATCH node` in combination with  `collect({key: node.value}) AS values`, the resulting array may be filled with one object with `null` values: `[{key: null}]`. This method reduces the array to `[]` by calling `removeEmptyArrays(data, 'values', 'key')`.

|Param|Details|
|---|---|
|`data`|_Type:_ `any[]`|
|`arrayKey`|_Type:_ `string` <br> Property key of the array to check.|
|`checkKey`|_Type:_ `string` <br> Property key of first array element to check against `null`.|

Returns cleaned data array.

```javascript
const query = `
  MATCH (p:Person {name: "Alex"})-[:HAS_ADDRESS]->(add:Address)
  OPTIONAL MATCH (p)-[:HAS_FRIEND]->(f:Person)-[:HAS_ADDRESS]->(fAddr:Address)
  RETURN p.name AS name,
         add AS address,
         collect({name: f.name, address: fAddr}) AS friends
`;

const results = await neo4j.readTransaction(query);
console.log(results);

// [
//   {
//     name: 'Alex',
//     address: {
//       ZIP: '10178',
//       number: '1',
//       town: 'Berlin',
//       street: 'Alexanderplatz'
//     },
//     friends: [ { address: null, name: null } ]
//   }
// ]

const resultsCleaned = neo4j.removeEmptyArrays(results, 'friends', 'name');
console.log(resultsCleaned);

// [
//   {
//     name: 'Alex',
//     address: {
//       ZIP: '10178',
//       number: '1',
//       town: 'Berlin',
//       street: 'Alexanderplatz'
//     },
//     friends: []
//   }
// ]
```

## Testing

Copy `test/config-sample.js` to `test/config.js` and change the values according to the settings of your Neo4j instance. Then, run test command:

    npm test
