package com.datalynkr.sales.data

import androidx.room.*
import com.datalynkr.sales.models.SalesVoucher
import kotlinx.coroutines.flow.Flow

/**
 * Room Database for Sales Cache
 * Replaces OPFS/IndexedDB from web dashboard
 */
@Database(
    entities = [SalesVoucherEntity::class, SalesCacheMetadataEntity::class],
    version = 1,
    exportSchema = false
)
@TypeConverters(Converters::class)
abstract class SalesDatabase : RoomDatabase() {
    abstract fun salesDao(): SalesDao
    abstract fun cacheMetadataDao(): CacheMetadataDao
}

/**
 * Room Entity for Sales Voucher
 */
@Entity(
    tableName = "sales_vouchers",
    indices = [
        Index(value = ["companyGuid", "date"]),
        Index(value = ["companyGuid", "partyledgername"]),
        Index(value = ["companyGuid", "vouchernumber"], unique = true)
    ]
)
data class SalesVoucherEntity(
    @PrimaryKey(autoGenerate = true)
    val id: Long = 0,
    val companyGuid: String,
    val tallylocId: String,
    val masterid: String?,
    val alterid: String?,
    val vouchernumber: String,
    val vouchertypename: String?,
    val date: String, // YYYY-MM-DD format
    val cp_date: String?, // YYYY-MM-DD format
    val partyledgername: String?,
    val partyledgernameid: String?,
    val partygstin: String?,
    val pincode: String?,
    val state: String?,
    val country: String?,
    val amount: Double,
    val quantity: Double,
    val profit: Double?,
    val profitmargin: Double?,
    val salesperson: String?,
    // JSON fields for nested data
    val ledgerentriesJson: String?, // JSON array of ledger entries
    val inventoryentriesJson: String?, // JSON array of inventory entries
    val udfFieldsJson: String?, // JSON object of UDF fields
    val rawDataJson: String, // Full JSON voucher data for compatibility
    val createdAt: Long = System.currentTimeMillis(),
    val updatedAt: Long = System.currentTimeMillis()
)

/**
 * Cache metadata entity
 */
@Entity(
    tableName = "sales_cache_metadata",
    indices = [Index(value = ["companyGuid"], unique = true)]
)
data class SalesCacheMetadataEntity(
    @PrimaryKey
    val companyGuid: String,
    val tallylocId: String,
    val companyName: String,
    val timestamp: Long,
    val voucherCount: Int,
    val startDate: String, // YYYY-MM-DD
    val endDate: String,   // YYYY-MM-DD
    val isComplete: Boolean = false, // True if complete cache downloaded
    val lastSyncTime: Long = System.currentTimeMillis()
)

/**
 * Type converters for Room
 */
class Converters {
    @TypeConverter
    fun fromStringList(value: List<String>?): String? {
        return value?.joinToString(",")
    }
    
    @TypeConverter
    fun toStringList(value: String?): List<String>? {
        return value?.split(",")?.filter { it.isNotEmpty() }
    }
}

/**
 * DAO for sales vouchers
 */
@Dao
interface SalesDao {
    
    @Query("SELECT * FROM sales_vouchers WHERE companyGuid = :companyGuid AND date BETWEEN :startDate AND :endDate ORDER BY date DESC")
    suspend fun getVouchersByDateRange(companyGuid: String, startDate: String, endDate: String): List<SalesVoucherEntity>
    
    @Query("SELECT * FROM sales_vouchers WHERE companyGuid = :companyGuid AND date BETWEEN :startDate AND :endDate ORDER BY date DESC")
    fun getVouchersByDateRangeFlow(companyGuid: String, startDate: String, endDate: String): Flow<List<SalesVoucherEntity>>
    
    @Query("SELECT * FROM sales_vouchers WHERE companyGuid = :companyGuid")
    suspend fun getAllVouchersByCompany(companyGuid: String): List<SalesVoucherEntity>
    
    @Query("SELECT * FROM sales_vouchers WHERE companyGuid = :companyGuid AND vouchernumber = :voucherNumber LIMIT 1")
    suspend fun getVoucherByNumber(companyGuid: String, voucherNumber: String): SalesVoucherEntity?
    
    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertVoucher(voucher: SalesVoucherEntity): Long
    
    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertVouchers(vouchers: List<SalesVoucherEntity>): List<Long>
    
    @Update
    suspend fun updateVoucher(voucher: SalesVoucherEntity)
    
    @Delete
    suspend fun deleteVoucher(voucher: SalesVoucherEntity)
    
    @Query("DELETE FROM sales_vouchers WHERE companyGuid = :companyGuid")
    suspend fun deleteAllVouchersByCompany(companyGuid: String)
    
    @Query("DELETE FROM sales_vouchers WHERE companyGuid = :companyGuid AND date < :beforeDate")
    suspend fun deleteVouchersBeforeDate(companyGuid: String, beforeDate: String)
    
    @Query("SELECT COUNT(*) FROM sales_vouchers WHERE companyGuid = :companyGuid")
    suspend fun getVoucherCount(companyGuid: String): Int
    
    @Query("SELECT COUNT(*) FROM sales_vouchers WHERE companyGuid = :companyGuid AND date BETWEEN :startDate AND :endDate")
    suspend fun getVoucherCountByDateRange(companyGuid: String, startDate: String, endDate: String): Int
    
    @Query("SELECT MIN(date) FROM sales_vouchers WHERE companyGuid = :companyGuid")
    suspend fun getOldestVoucherDate(companyGuid: String): String?
    
    @Query("SELECT MAX(date) FROM sales_vouchers WHERE companyGuid = :companyGuid")
    suspend fun getNewestVoucherDate(companyGuid: String): String?
    
    @Query("SELECT DISTINCT partyledgername FROM sales_vouchers WHERE companyGuid = :companyGuid AND partyledgername IS NOT NULL ORDER BY partyledgername")
    suspend fun getDistinctCustomers(companyGuid: String): List<String>
    
    @Query("SELECT DISTINCT state FROM sales_vouchers WHERE companyGuid = :companyGuid AND state IS NOT NULL ORDER BY state")
    suspend fun getDistinctStates(companyGuid: String): List<String>
    
    @Query("SELECT DISTINCT country FROM sales_vouchers WHERE companyGuid = :companyGuid AND country IS NOT NULL ORDER BY country")
    suspend fun getDistinctCountries(companyGuid: String): List<String>
}

/**
 * DAO for cache metadata
 */
@Dao
interface CacheMetadataDao {
    
    @Query("SELECT * FROM sales_cache_metadata WHERE companyGuid = :companyGuid LIMIT 1")
    suspend fun getMetadata(companyGuid: String): SalesCacheMetadataEntity?
    
    @Query("SELECT * FROM sales_cache_metadata WHERE companyGuid = :companyGuid LIMIT 1")
    fun getMetadataFlow(companyGuid: String): Flow<SalesCacheMetadataEntity?>
    
    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertMetadata(metadata: SalesCacheMetadataEntity)
    
    @Update
    suspend fun updateMetadata(metadata: SalesCacheMetadataEntity)
    
    @Delete
    suspend fun deleteMetadata(metadata: SalesCacheMetadataEntity)
    
    @Query("DELETE FROM sales_cache_metadata WHERE companyGuid = :companyGuid")
    suspend fun deleteMetadataByCompany(companyGuid: String)
    
    @Query("SELECT * FROM sales_cache_metadata")
    suspend fun getAllMetadata(): List<SalesCacheMetadataEntity>
}

/**
 * Repository pattern for data access
 */
class SalesRepository(private val salesDao: SalesDao, private val metadataDao: CacheMetadataDao) {
    
    // Voucher operations
    suspend fun getVouchersByDateRange(companyGuid: String, startDate: String, endDate: String): List<SalesVoucherEntity> {
        return salesDao.getVouchersByDateRange(companyGuid, startDate, endDate)
    }
    
    fun getVouchersByDateRangeFlow(companyGuid: String, startDate: String, endDate: String): Flow<List<SalesVoucherEntity>> {
        return salesDao.getVouchersByDateRangeFlow(companyGuid, startDate, endDate)
    }
    
    suspend fun getAllVouchers(companyGuid: String): List<SalesVoucherEntity> {
        return salesDao.getAllVouchersByCompany(companyGuid)
    }
    
    suspend fun insertVouchers(vouchers: List<SalesVoucherEntity>) {
        salesDao.insertVouchers(vouchers)
    }
    
    suspend fun clearCache(companyGuid: String) {
        salesDao.deleteAllVouchersByCompany(companyGuid)
        metadataDao.deleteMetadataByCompany(companyGuid)
    }
    
    suspend fun getVoucherCount(companyGuid: String): Int {
        return salesDao.getVoucherCount(companyGuid)
    }
    
    suspend fun getDateRange(companyGuid: String): Pair<String?, String?> {
        val oldest = salesDao.getOldestVoucherDate(companyGuid)
        val newest = salesDao.getNewestVoucherDate(companyGuid)
        return Pair(oldest, newest)
    }
    
    // Metadata operations
    suspend fun getCacheMetadata(companyGuid: String): SalesCacheMetadataEntity? {
        return metadataDao.getMetadata(companyGuid)
    }
    
    fun getCacheMetadataFlow(companyGuid: String): Flow<SalesCacheMetadataEntity?> {
        return metadataDao.getMetadataFlow(companyGuid)
    }
    
    suspend fun updateMetadata(metadata: SalesCacheMetadataEntity) {
        metadataDao.insertMetadata(metadata)
    }
    
    // Filter helpers
    suspend fun getDistinctCustomers(companyGuid: String): List<String> {
        return salesDao.getDistinctCustomers(companyGuid)
    }
    
    suspend fun getDistinctStates(companyGuid: String): List<String> {
        return salesDao.getDistinctStates(companyGuid)
    }
    
    suspend fun getDistinctCountries(companyGuid: String): List<String> {
        return salesDao.getDistinctCountries(companyGuid)
    }
}
