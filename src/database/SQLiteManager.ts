import { open, QuickSQLiteConnection } from 'react-native-quick-sqlite';
import { createTables } from './schema';

let db: QuickSQLiteConnection | null = null;

export const getDB = (): QuickSQLiteConnection => {
    if (!db) {
        db = open({
            name: 'sales_cache.db',
        });
        // Ensure tables exist
        createTables(db);
    }
    return db;
};

export const initializeDB = () => {
    const database = getDB();
    database.execute(`
    PRAGMA journal_mode=WAL;
    PRAGMA synchronous=NORMAL;
  `);
};
