import { Config, Driver, Record, ServerInfo, Session } from 'neo4j-driver';
interface IParams {
    [key: string]: any;
}
/**
 * Initialize Neo4j driver instance.
 * @param url
 * @param user
 * @param password
 * @param database Database, default: 'neo4j'
 * @param options neo4j-driver config options
 */
declare function init(url: string, user: string, password: string, database?: string, options?: Config): Promise<ServerInfo>;
/**
 * Get driver instance.
 */
declare function getDriver(): Driver;
/**
 * Acquire a session.
 */
declare function session(): Session;
/**
 * READ transaction without modifying database.
 */
declare function readTransaction<T>(query: string, params?: IParams): Promise<T[]>;
/**
 * WRITE transaction that modifies database.
 */
declare function writeTransaction<T>(query: string, params?: IParams): Promise<T[]>;
/**
 * Call multiple statements in one transaction.
 */
declare function multipleStatements<T>(statements: {
    statement: string;
    parameters: IParams;
}[]): Promise<T[][]>;
/**
 * Extract and convert records returned by neo4j-driver.
 */
declare function extractRecords<T>(data: Record[]): T[];
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
declare function removeEmptyArrays<T>(data: T[], arrayKey: string, checkKey: string): T[];
export { init, getDriver, session, readTransaction, writeTransaction, multipleStatements, extractRecords, removeEmptyArrays };
