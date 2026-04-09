import { open } from 'react-native-quick-sqlite';

export default {
    enablePromise: (enable: boolean) => {
        // quick-sqlite is sync/promise based already
    },
    openDatabase: (config: any, successCb?: (db: any) => void, errorCb?: (err: any) => void) => {
        try {
            const qdb = open({ name: config.name });

            const mappedDb = {
                executeSql: async (query: string, params: any[] = []) => {
                    const res = await qdb.executeAsync(query, params);
                    return [{
                        rows: {
                            length: res.rows?.length || 0,
                            item: (i: number) => res.rows?.item(i),
                            raw: () => res.rows?._array || []
                        },
                        insertId: res.insertId,
                        rowsAffected: res.rowsAffected
                    }];
                },
                transaction: (
                    fn: (tx: any) => void,
                    errCb?: (err: any) => void,
                    txnSuccessCb?: () => void
                ) => {
                    // Wrap inner execution
                    const txWrapper = {
                        executeSql: (
                            sql: string,
                            params: any[] = [],
                            onSuccess?: (tx: any, res: any) => void,
                            onError?: (tx: any, err: any) => void
                        ) => {
                            qdb.executeAsync(sql, params)
                                .then(res => {
                                    const resObj = {
                                        rows: {
                                            length: res.rows?.length || 0,
                                            item: (i: number) => res.rows?.item(i),
                                            raw: () => res.rows?._array || []
                                        },
                                        insertId: res.insertId,
                                        rowsAffected: res.rowsAffected
                                    };
                                    if (onSuccess) onSuccess(txWrapper, resObj);
                                })
                                .catch(err => {
                                    if (onError) onError(txWrapper, err);
                                    else if (errCb) errCb(err);
                                });
                        }
                    };

                    try {
                        fn(txWrapper);
                        if (txnSuccessCb) txnSuccessCb();
                    } catch (e) {
                        if (errCb) errCb(e);
                    }
                }
            };

            if (successCb) {
                successCb(mappedDb);
            }

            return mappedDb;
        } catch (e) {
            if (errorCb) errorCb(e);
            throw e;
        }
    }
};
