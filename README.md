# x-mysql
use ssh tunnel connect to mysql 

### 直接连接 mysql 数据库

``` ts
const mysqlDb = await SshMySql({
    database: 'db',
    user: 'root',
    password: '<root pass>',
    port: 3306,
    host: 'ip or hostname'
}).catch(e => { Log.error(e); return null; });

if (mysqlDb == null) {
    console.log('数据库连接错误');
    process.exit(1);
}
const result = await mysqlDb.query('select * from table where id > ?', 100);
if(!result.success){
    // show err
}

// do something
```

### 使用 SSH通道连接 mysql 数据库

``` ts
const mysqlDb = await SshMySql({
    database: 'db',
    user: 'root',
    password: '<root pass>',
    port: 3306,
    host: 'ip or hostname'
}, {
    host: 'ip or hostname',
    port: 22,
    username: 'root',
    privateKey: fs.readFileSync(path.join('path to key', 'root_id_rsa'))
}).catch(e => { Log.error(e); return null; });
if (mysqlDb == null) {
    console.log('数据库连接错误');
    process.exit(1);
}
const result = await mysqlDb.query('select * from table where id > ?', 100);
if(!result.success){
    // show err
}

// do something
```

### API

``` ts

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
```

