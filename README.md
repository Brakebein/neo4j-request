# neo4j-request

A simplified interface for [neo4j-driver](https://github.com/neo4j/neo4j-javascript-driver) that extracts and converts the queried properties from the records.

## Installation

Via npm:

    npm install brakebein/neo4j-request

## Usage

Import:

```javascript
const neo4j = require('neo4j-request');
// or
import * as neo4j from 'neo4j-request';
```

Before doing any transaction, the neo4j-driver needs to be initialized once.
The driver instance is set globally, such that you can import neo4j in any other module without the need to initialize again.
For detailed `options` refer to [neo4j-driver](https://github.com/neo4j/neo4j-javascript-driver).

```javascript
neo4j.init(url, user, password, database = 'neo4j', options = {disableLosslessIntegers: true});
```

Simple read transaction:

```javascript
const query = `
  MATCH (p:Person {name: $name)-[:HAS_ADDRESS]->(add:Address)
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
//       street: 'Alexanderplatz',
//       number: '1',
//       ZIP: '10178',
//       town: 'Berlin'
//     }
//   }
// ]
```

## Test

Copy `test/config-sample.js` to `test/config.js` and change the values according to the settings of your Neo4j instance. Then, run test command:

    npm test
