import mysql from 'mysql';
import Tunnel from 'tunnel-ssh';
import { Server } from 'net';

const CURRENT_TIMESTAMP = { toSqlString: function () { return 'CURRENT_TIMESTAMP()'; } };

type IDbDataType = number | string | boolean | Date | null;
/**
 * SQL UPDATE 数据
 */
export interface IUpdateData {
    [field: string]: IDbDataType;
}
export interface OkPacket {
    fieldCount: number;
    affectedRows: number;
    insertId: number;
    serverStatus: number;
    warningCount: number;
    message: string;
    protocol41: boolean;
    changedRows: number;
}
export interface IDbResult {
    Success: boolean;
    Err: mysql.MysqlError | null;
    Result: any[],
    Fields: mysql.FieldInfo[]
}
export interface IDbInsertResult extends IDbFailResult {
    Result: OkPacket;
    Fields: mysql.FieldInfo[]
}
export interface IDbFailResult {
    Success: boolean;
    Err: mysql.MysqlError | null;
}
export interface IDbConfig {
    host: string,
    port?: number,
    user: string,
    password?: string,
    database: string
}
export interface ISshConfig {
    host: string;
    port?: number,
    username: string;
    password?: string;
    /**
     * require('fs').readFileSync('<pathToKeyFile>'),
     */
    privateKey?: Buffer | string;
    /**
     * option see ssh2 config
     */
    passphrase?: string;
}
interface ITunnelConfig {
    /**
     * 目标服务器地址 mysql server host
     */
    remoteHost: string;
    /**
     * 目标服务器端口 mysql server port
     */
    remotePort?: number;
    /**
     * 本地转接端口 a available local port
     */
    localPort: number;
    /**
     * dump information to stdout
     */
    verbose: boolean;
    /**
     * set this to true to disable tunnel (useful to keep architecture for local connections)
     */
    disabled: boolean;
    sshConfig: ISshConfig;
}
const defaultDbConfig: IDbConfig = {
    host: 'localhost',
    port: 3306,
    user: 'root',
    database: '',
}
const defaultSshConfig: ISshConfig = {
    host: 'localhost',
    port: 22,
    username: 'root',
}
const fixResults = (results: any, fields?: mysql.FieldInfo[]) => {
    if (Array.isArray(results)) {
        return {
            Success: true,
            Err: null,
            Result: results.map(item => fixDbRecord(item, fields || [])),
            Fields: fields || []
        };
    } else {
        return {
            Success: true,
            Err: null,
            Result: [results],
            Fields: fields || []
        };
    }
}
const getInsrtResult = (result: IDbResult): IDbInsertResult => {
    return {
        Success: result.Success,
        Err: result.Err,
        Fields: result.Fields,
        Result: {
            ...result.Result[0]
        }
    }
}
const fixDbRecord = (data: any, fields: mysql.FieldInfo[]) => {
    const r: { [key: string]: any } = {};
    fields.forEach(field => {
        switch (field.type) {
            case mysql.Types.BIT:
                r[field.name] = (<Buffer>data[field.name])[0] != 0;
                break;
            default:
                r[field.name] = data[field.name];
                break;
        }
    });
    for (const key in data) {
        if (data.hasOwnProperty(key)) {
            const element = data[key];
            //console.log(key, typeof element, element instanceof Buffer);
            if (element instanceof Buffer) {
                data[key] = element[0];
            }
        }
    }
    return r;
}
class Query {
    private _mode = 1;
    private _sql!: MySQL;
    private _table: string = '';
    private _tableAlias: string = '';
    private _colums: string[] = [];
    private _where: string = '';
    public constructor(sql: MySQL, table: string, alias: string = '') {
        this._sql = sql;
        this._table = table;
        this._tableAlias = alias;
    }
    public Column(columns: string): Query;
    public Column(columns: string[]): Query;
    public Column(column: { feild: string, alias: string }): Query;
    public Column(columns: { feild: string, alias: string }[]): Query;
    public Column(args: string | string[] | { feild: string, alias: string } | { feild: string, alias: string }[]) {
        // console.log('COLUMN', args);
        if (typeof args === 'string') {
            if (args === '*') {
                this._colums = [];
                return this;
            }
            return this.Column(args.split(',').map(s => s.trim()));
        } else if (Array.isArray(args)) {
            if (args.length < 1) {
                return this;
            }
            this._colums = [];
            for (let index = 0; index < args.length; index++) {
                const item = args[index];
                // console.log(typeof item, item);
                if (typeof item === 'string') {
                    if (/^[a-z][a-z_0-9]{0,}\.{0,1}[a-z_0-9]{0,} {1,}AS {1,}[a-z][a-z_0-9]{0,}$/ig.test(item)) {
                        const a = item.split(/ {1,}AS {1,}/ig).map(s => s.trim())
                        // console.log(a);
                        this._colums.push(`${this._sql.Connection.escapeId(a[0])} AS ${this._sql.Connection.escape(a[1])}`);
                    } else {
                        this._colums.push(`${this._sql.Connection.escapeId(item)}`);
                    }
                } else {
                    this._colums.push(`${this._sql.Connection.escapeId(item.feild)} AS ${this._sql.Connection.escape(item.alias)}`);
                }
            }
        } else {
            this._colums = [`${this._sql.Connection.escapeId(args.feild)} AS ${this._sql.Connection.escape(args.alias)}`];
        }
        return this;
    }
    public Join(table: string, alias: string, condition: string) {
        return this;
    }
    public Where(where: string) {
        return this;
    }
    public AndWhere(condition: string) {
        return this;
    }
    public OrWhere(condition: string) {
        return this;
    }
    private getTable(table: string, alias: string) {
        if (alias && alias.length > 0) {
            return `${this._sql.Connection.escapeId(this._table)} AS ${this._sql.Connection.escapeId(alias)} `;
        }
        return `${this._sql.Connection.escapeId(this._table)} `;
    }
    public toSql() {
        let sql = '';
        switch (this._mode) {
            case 1: sql += 'SELECT '; break;
        }
        if (this._colums.length < 1) {
            sql += '* ';
        } else {
            sql += this._colums.join(', ') + ' ';
        }
        switch (this._mode) {
            case 1: sql += `FROM ${this.getTable(this._table, this._tableAlias)}`; break;
        }
        if (this._where && this._where.length > 1) {
            sql += `WHERE ${this._where}`;
        }
        return sql;
    }
}
class Transaction {
    private _conn!: mysql.Connection;
    constructor(conn: mysql.Connection) {
        this._conn = conn;
    }
    public commit() {
        return new Promise<boolean>((resolve, reject) => {
            this._conn.commit(async (err: mysql.MysqlError) => {
                if (err) {
                    await this.rollBack();
                    reject(err);
                }
                resolve(true);
            });
        });
    }
    public rollBack() {
        return new Promise<boolean>((resolve, reject) => {
            this._conn.rollback((err: mysql.MysqlError) => {
                console.log('ROLL_BACK')
                if (err) return reject(err);
                resolve(true);
            });
        });
    }
}
export const fixCatch = (err: any):IDbResult => {
    return {
        Success: false,
        Err: err,
        Result: [],
        Fields: []
    };
}
const PRIVATE_NUM = '2926219';
export class MySQL {
    private _dbConfig!: IDbConfig;
    private _tunnelConfig!: ITunnelConfig;
    private _tunnel!: Server;
    private _isUseSshTunnel:boolean = false;
    public constructor(privateNumber:string, dbConfig: IDbConfig) {
        if(privateNumber != PRIVATE_NUM){
            throw new Error('请使用：sshMySql = (dbConfig: IDbConfig, sshConfig: ISshConfig | null = null)')
        }
        this._dbConfig = {
            ...defaultDbConfig,
            ...dbConfig,
        };
    }
    private _connection!: mysql.Connection;
    public get Connection() { return this._connection; }
    private errorHandler(err: mysql.MysqlError) {
        //
        // Check for lost connection and try to reconnect
        //
        if (err.code === 'PROTOCOL_CONNECTION_LOST') {
            // console.log('MySQL connection lost. Reconnecting.');
            this._connection = this.connect();
        } else if (err.code === 'ECONNREFUSED') {
            //
            // If connection refused then keep trying to reconnect every 3 seconds
            //
            // console.log('MySQL connection refused. Trying soon again. ' + err);
            setTimeout(() => {
                this._connection = this.connect();
            }, 3000);
        }
    }
    public UseSsh(sshConfig:ISshConfig){
        this._tunnelConfig = {
            remoteHost: this._dbConfig.host,
            remotePort: this._dbConfig.port,
            verbose: true,
            disabled: false,
            localPort: 7777,
            sshConfig: {
                ...defaultSshConfig,
                ...sshConfig
            },
        };
        this._dbConfig.port = 7777;
        this._dbConfig.host = '127.0.0.1';
        this._isUseSshTunnel= true;
        return this;
    }
    public init(callback: Function | null = null) {
        var me = this;

        if(!this._isUseSshTunnel){
            this._connection = this.connect(callback);
            return;
        }
        // Convert original Config to new style config:
        var config = this._tunnelConfig;

        var newStyleConfig = {
            username: config.sshConfig.username,
            port: config.sshConfig.port,
            host: config.sshConfig.host,
            // SSH2 Forwarding... 
            dstPort: config.remotePort, // 目标服务器端口
            dstHost: config.remoteHost, // 目标服务器地址
            //srcPort: config.localPort,
            //srcHost: '127.0.0.1',
            // Local server or something...
            localPort: config.localPort,
            localHost: '127.0.0.1',
            privateKey: config.sshConfig.privateKey
        }


        this._tunnel = Tunnel(newStyleConfig, (err) => {
            // console.log('Tunnel connected', err);
            if (err) {
                if (callback)
                    callback(err);
                return;
            }
            this._connection = me.connect(callback);
        });
    }
    private connect(callback: Function | null = null) {
        //
        // Create the mysql connection object
        //
        const connection = mysql.createConnection(this._dbConfig);
        connection.on('error', this.errorHandler);
        //
        // Try connecting
        //
        connection.connect((err: mysql.MysqlError) => {
            if (err) throw err;
            // console.log('Mysql connected as id ' + connection.threadId);
            if (callback)
                callback(err);
        });
        return connection;
    }
    public GetQuery(table: string, alias: string = '') {
        return new Query(this, table, alias);
    }
    /**
     * SELECT COUNT(*) FROM
     * @param sql 
     * @param bindData 
     */
    public async Count(sql: string, ...bindData: any[]): Promise<number> {
        const r = await this.query.apply(this, [sql, ...bindData]);
        // console.log(r);
        if (!r.Success)
            return 0;
        return r.Result[0]['COUNT(*)'];
    }
    /**
     * 向数据表中插入数据
     * @param table 要插入数据的表名
     * @param toInsertData 要插入的数据
     */
    public async Insert(table: string, toInsertData: { [key: string]: string | Date | number | null | boolean }): Promise<IDbInsertResult> {
        const sql = `INSERT INTO ${this.Connection.escapeId(table)} SET ?`;
        const r = await this.query.apply(this, [sql, toInsertData]);
        return getInsrtResult(r);
    }
    /**
     * 更新表
     * @param table 要更新的表名
     * @param toUpdateData 要更新数据
     * @param where 条件
     */
    public async Update(table: string, toUpdateData: IUpdateData, where: string): Promise<IDbInsertResult> {
        const fields: string[] = [];
        const values: IDbDataType[] = [];
        for (const key in toUpdateData) {
            fields.push(this.Connection.escapeId(key));
            values.push(toUpdateData[key]);
        }
        const sql = `UPDATE ?? SET ${fields.map(f => `${f} = ?`).join(',')} WHERE ${where}`;
        const r = await this.query.apply(this, [sql, table, ...values]);
        return getInsrtResult(r);
    }
    // /**
    //  * 所有操作执行完成以后会自动提交（commit），发生错误会自动回滚（rollback）
    //  * @param sqlQuery 
    //  */
    // public beginTransaction(sqlQuery: Function) {
    //     return new Promise<any[]>((resolve, reject) => {
    //         this.Connection.beginTransaction(async (err: mysql.MysqlError) => {
    //             if (err) {
    //                 throw err;
    //             }
    //             try {
    //                 await sqlQuery();
    //             } catch (err) {
    //                 return this.Connection.rollback(reject);
    //             }
    //             this.Connection.commit((err: mysql.MysqlError) => {
    //                 if (err) return this.Connection.rollback(reject);
    //                 resolve();
    //             });
    //         })
    //     });
    // }
    /**
     * 开始事务
     */
    public BeginTransaction() {
        return new Promise<Transaction>((resolve, reject) => {
            this.Connection.beginTransaction((err) => {
                if (err) {
                    throw err;
                }
                resolve(new Transaction(this.Connection));
            })
        });
    }
    /**
     * 执行查询，如果发生异常但是没有catch会报异常
     * @param sql 
     * @param bindData 
     */
    public query(sql: string, ...bindData: any[]) {
        return new Promise<IDbResult>((resolve, reject) => {
            this.Connection.query(sql, bindData, (err: mysql.MysqlError | null, results?: any, fields?: mysql.FieldInfo[]) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(fixResults(results, fields));
                }
            });
        });
    }
    /**
     * 关闭数据库连接，会等待之前未完成的数据传输
     */
    public close = () => new Promise<void>((resolve, reject) => {
        this.Connection.end((err: mysql.MysqlError) => {
            if (err) reject(err);
            else resolve();
        })
    });
    /**
     * 立即关闭连接，抛弃数据
     */
    public destroy = () => this.Connection.destroy();
}

export const sshMySql = (dbConfig: IDbConfig, sshConfig: ISshConfig | null = null) => {
    return new Promise<MySQL>((resolve, reject) => {
        var mysql = new MySQL(PRIVATE_NUM, dbConfig)
        if(sshConfig){
            mysql.UseSsh(sshConfig);
        }
        mysql.init((err: any) => {
            if (err)
                reject(err);
            else
                resolve(mysql);
        });
    });
}
export default sshMySql;
