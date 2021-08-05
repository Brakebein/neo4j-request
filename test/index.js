const neo4j = require('..');
const config = require('./config');

main();

async function main() {

  try {

    await neo4j.init(config.url, config.user, config.password, config.database);

    const results1 = await neo4j.readTransaction(`CALL db.indexes()`);

    console.log('Indexes:', results1);

    const results2 = await neo4j.readTransaction(`MATCH (n) RETURN n AS node LIMIT 3`);

    console.log('Nodes:', results2);

    console.log('No Errors.');
    process.exit();

  } catch (err) {

    console.error(err);
    process.exit(1);

  }

}
