    /* 测试事务
    const ts = await mysqlDb.BeginTransaction();
    try {
        const u = await mysqlDb.query('UPDATE shipping_cost_oversea SET ADD_WEIGHT = ? WHERE SHIPPING_COST_ID = ?', 444, 219);
        // console.log(u)
        const rrr = await mysqlDb.query('SELECT SHIPPING_COST_ID, COUNTRY_CODE FROM shipping_cost_oversea1 WHERE SHIPPING_TYPE_ID=?', 1002);
        // console.log(rrr);
    } catch (err) {
        console.log(err.message);
        await ts.rollBack();
    }
    await ts.commit();
    //*/

    // const u=await mysqlDb.query('UPDATE shipping_cost_oversea SET ADD_WEIGHT = ? WHERE SHIPPING_COST_ID = ?', 111, 219);
    // console.log(u)
    // const rrr = await mysqlDb.query('SELECT SHIPPING_COST_ID, COUNTRY_CODE FROM shipping_cost_oversea1 WHERE SHIPPING_TYPE_ID=?', 1002);
    // if(!rrr.Success){
    //     throw rrr.Err;
    // }
    // console.log('bb',rrr);