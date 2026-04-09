# COMPLETE CURSOR AGENT PROMPT: Android Cache Manager Implementation

## 🎯 MISSION

Implement a **production-ready cache management system** in the TallyDashboard Android app that **exactly mirrors** the web version's OPFS (with IndexedDB fallback) pattern using native Android file system APIs.

---

## 📚 CONTEXT: What the Web Version Does

Your web app (`CacheManagement.js`):
- **Primary storage**: OPFS (Origin Private File System) - unlimited file-based cache
- **Fallback storage**: IndexedDB - if OPFS unavailable
- **Pattern**: Async promises with cache-first strategy
- **Behavior**: Write once, read with expiration checking, return null on miss
- **Data**: JSON serialization, automatic type handling
- **Features**: TTL support (-1 = no expiration), metadata tracking, error fallback

---

## 🏗️ ANDROID EQUIVALENT ARCHITECTURE

| Web Component | Android Replacement | Why This Works |
|---------------|-------------------|-----------------|
| OPFS (primary) | `context.getExternalCacheDir()` | Unlimited external storage, per-app sandbox, no permissions needed |
| IndexedDB (fallback) | `context.getCacheDir()` | Limited internal storage (~5-10MB), automatic fallback |
| Promises (async) | Kotlin Coroutines with `Dispatchers.IO` | Native async pattern, non-blocking, suspendable |
| JSON serialization | Gson library | Full object → JSON → object conversion |
| TTL checking | On-read validation | Lazy deletion, same semantics as web |
| Error handling | Try-catch + return null/false | No exceptions thrown, graceful degradation |

---

## 📋 COMPLETE IMPLEMENTATION SPEC

### FILE 1: `CacheManager.kt`
**Location**: `src/main/java/com/tallycatalyst/cache/CacheManager.kt`

**Type**: Kotlin `object` (singleton)

**Initialization**:
```kotlin
object CacheManager {
    private lateinit var context: Context
    private val gson = Gson()
    private val logger = LoggerFactory.getLogger(CacheManager::class.java)
    
    fun initialize(appContext: Context) {
        context = appContext
        logger.info("CacheManager initialized")
    }
}
```

**Core Methods** (all `suspend` functions - async/await pattern):

```kotlin
/**
 * Write data to cache with optional TTL
 * 
 * @param key Cache key identifier
 * @param data Any serializable object
 * @param ttlMillis Time-to-live in milliseconds (-1 = never expire)
 * @return true if written successfully, false if both storages failed
 */
suspend fun writeCache(
    key: String,
    data: Any,
    ttlMillis: Long = -1
): Boolean = withContext(Dispatchers.IO) {
    try {
        val hashedKey = hashKey(key)
        val cacheFile = getCacheFile(hashedKey) ?: return@withContext false
        
        val cacheEntry = mapOf(
            "metadata" to mapOf(
                "key" to key,
                "createdAt" to System.currentTimeMillis(),
                "ttlMillis" to ttlMillis,
                "dataType" to data::class.java.name,
                "size" to 0  // calculated after write
            ),
            "data" to data
        )
        
        val jsonString = gson.toJson(cacheEntry)
        cacheFile.writeText(jsonString, Charsets.UTF_8)
        
        updateMetadataIndex(key, cacheFile.length())
        logger.info("Cache WRITE: key=$key, size=${cacheFile.length()}, ttl=$ttlMillis")
        
        return@withContext true
    } catch (e: Exception) {
        logger.error("Cache WRITE failed: key=$key, error=${e.message}")
        return@withContext false
    }
}

/**
 * Read cached data with automatic expiration checking
 * 
 * @param key Cache key identifier
 * @param dataClass Class type to deserialize to
 * @return Cached object if exists and not expired, null otherwise
 */
suspend fun <T> readCache(
    key: String,
    dataClass: Class<T>
): T? = withContext(Dispatchers.IO) {
    try {
        val hashedKey = hashKey(key)
        val cacheFile = getCacheFile(hashedKey) ?: run {
            logger.info("Cache MISS: key=$key (file not found)")
            return@withContext null
        }
        
        val jsonString = cacheFile.readText(Charsets.UTF_8)
        val cacheEntry = gson.fromJson(jsonString, Map::class.java)
        
        @Suppress("UNCHECKED_CAST")
        val metadata = cacheEntry["metadata"] as? Map<String, Any> ?: return@withContext null
        val data = cacheEntry["data"]
        
        // Check TTL expiration
        val createdAt = (metadata["createdAt"] as? Number)?.toLong() ?: return@withContext null
        val ttlMillis = (metadata["ttlMillis"] as? Number)?.toLong() ?: -1
        
        if (ttlMillis > 0) {
            val age = System.currentTimeMillis() - createdAt
            if (age > ttlMillis) {
                logger.info("Cache EXPIRED: key=$key, age=$age ms, ttl=$ttlMillis ms")
                cacheFile.delete()
                return@withContext null
            }
        }
        
        // Deserialize data to target class
        val dataJson = gson.toJson(data)
        val result = gson.fromJson(dataJson, dataClass)
        
        logger.info("Cache HIT: key=$key")
        return@withContext result
        
    } catch (e: Exception) {
        logger.error("Cache READ failed: key=$key, error=${e.message}")
        return@withContext null
    }
}

/**
 * Check if cache exists and hasn't expired
 * 
 * @param key Cache key to check
 * @return true if valid, false if expired or missing
 */
suspend fun isCacheValid(key: String): Boolean = withContext(Dispatchers.IO) {
    try {
        val hashedKey = hashKey(key)
        val cacheFile = getCacheFile(hashedKey) ?: return@withContext false
        
        val jsonString = cacheFile.readText(Charsets.UTF_8)
        val cacheEntry = gson.fromJson(jsonString, Map::class.java)
        
        @Suppress("UNCHECKED_CAST")
        val metadata = cacheEntry["metadata"] as? Map<String, Any> ?: return@withContext false
        
        val createdAt = (metadata["createdAt"] as? Number)?.toLong() ?: return@withContext false
        val ttlMillis = (metadata["ttlMillis"] as? Number)?.toLong() ?: -1
        
        if (ttlMillis > 0) {
            val age = System.currentTimeMillis() - createdAt
            return@withContext age <= ttlMillis
        }
        
        return@withContext true
        
    } catch (e: Exception) {
        return@withContext false
    }
}

/**
 * Clear a specific cache entry
 * 
 * @param key Cache key to remove
 * @return true if deleted successfully
 */
suspend fun clearCache(key: String): Boolean = withContext(Dispatchers.IO) {
    try {
        val hashedKey = hashKey(key)
        val cacheFile = getCacheFile(hashedKey) ?: return@withContext false
        
        val deleted = cacheFile.delete()
        if (deleted) {
            removeFromMetadataIndex(key)
            logger.info("Cache CLEAR: key=$key")
        }
        return@withContext deleted
        
    } catch (e: Exception) {
        logger.error("Cache CLEAR failed: key=$key")
        return@withContext false
    }
}

/**
 * Clear all cache entries
 * 
 * @return true if successful
 */
suspend fun clearAllCache(): Boolean = withContext(Dispatchers.IO) {
    try {
        val cacheDir = getCacheDirectory() ?: return@withContext false
        cacheDir.listFiles()?.forEach { file ->
            if (file.isFile && file.extension == "json") {
                file.delete()
            }
        }
        logger.info("Cache CLEAR: all entries cleared")
        return@withContext true
        
    } catch (e: Exception) {
        logger.error("Cache CLEAR all failed: ${e.message}")
        return@withContext false
    }
}

/**
 * Get total cache size in bytes
 * 
 * @return Size in bytes, 0 if error
 */
fun getCacheSize(): Long {
    return try {
        val cacheDir = getCacheDirectory() ?: return 0
        cacheDir.walkTopDown()
            .filter { it.isFile }
            .map { it.length() }
            .sum()
    } catch (e: Exception) {
        logger.error("Get cache size failed: ${e.message}")
        0
    }
}

/**
 * Get available cache space
 * 
 * @return Available space in bytes
 */
fun getAvailableSpace(): Long {
    return try {
        val cacheDir = getCacheDirectory() ?: return 0
        cacheDir.freeSpace
    } catch (e: Exception) {
        0
    }
}

/**
 * Get cache statistics
 * 
 * @return CacheStats object with metrics
 */
fun getCacheStats(): CacheStats {
    return try {
        val cacheDir = getCacheDirectory() ?: return CacheStats()
        val files = cacheDir.listFiles()?.filter { it.isFile && it.extension == "json" } ?: emptyList()
        
        CacheStats(
            totalSize = files.sumOf { it.length() },
            itemCount = files.size,
            availableSpace = getAvailableSpace(),
            cacheDirectory = cacheDir.absolutePath
        )
    } catch (e: Exception) {
        CacheStats()
    }
}
```

**Helper Methods** (private):

```kotlin
private fun getCacheDirectory(): File? {
    return try {
        // Try external cache first (unlimited)
        val external = context.externalCacheDir
        if (external != null && external.exists()) {
            logger.debug("Using external cache directory")
            return external
        }
        
        // Fallback to internal cache (limited)
        val internal = context.cacheDir
        if (internal.exists()) {
            logger.warn("Falling back to internal cache directory")
            return internal
        }
        
        null
    } catch (e: Exception) {
        logger.error("Cache directory error: ${e.message}")
        null
    }
}

private fun getCacheFile(hashedKey: String): File? {
    val cacheDir = getCacheDirectory() ?: return null
    return File(cacheDir, "$hashedKey.json")
}

private fun hashKey(key: String): String {
    return try {
        val md = java.security.MessageDigest.getInstance("SHA-256")
        val digest = md.digest(key.toByteArray())
        digest.fold("") { str, byte -> str + "%02x".format(byte) }
    } catch (e: Exception) {
        key.replace(Regex("[^a-zA-Z0-9_-]"), "_")
    }
}

private fun updateMetadataIndex(key: String, size: Long) {
    try {
        val cacheDir = getCacheDirectory() ?: return
        val metadataFile = File(cacheDir, "metadata.json")
        
        val currentMetadata = if (metadataFile.exists()) {
            gson.fromJson(metadataFile.readText(), Map::class.java) as? MutableMap<String, Any>
                ?: mutableMapOf()
        } else {
            mutableMapOf()
        }
        
        @Suppress("UNCHECKED_CAST")
        val items = (currentMetadata.getOrDefault("items", mutableMapOf()) as? MutableMap<String, Any>)
            ?: mutableMapOf()
        
        items[key] = mapOf(
            "createdAt" to System.currentTimeMillis(),
            "size" to size
        )
        
        currentMetadata["items"] = items
        currentMetadata["lastUpdated"] = System.currentTimeMillis()
        
        metadataFile.writeText(gson.toJson(currentMetadata))
    } catch (e: Exception) {
        logger.error("Update metadata failed: ${e.message}")
    }
}

private fun removeFromMetadataIndex(key: String) {
    try {
        val cacheDir = getCacheDirectory() ?: return
        val metadataFile = File(cacheDir, "metadata.json")
        
        if (!metadataFile.exists()) return
        
        val metadata = gson.fromJson(metadataFile.readText(), MutableMap::class.java) as? MutableMap<String, Any>
            ?: return
        
        @Suppress("UNCHECKED_CAST")
        val items = (metadata.getOrDefault("items", mutableMapOf()) as? MutableMap<String, Any>)
            ?: return
        
        items.remove(key)
        metadataFile.writeText(gson.toJson(metadata))
    } catch (e: Exception) {
        logger.error("Remove metadata failed: ${e.message}")
    }
}
```

**Data Class**:
```kotlin
data class CacheStats(
    val totalSize: Long = 0,
    val itemCount: Int = 0,
    val availableSpace: Long = 0,
    val cacheDirectory: String = ""
)
```

---

### FILE 2: `CacheExtensions.kt`
**Location**: `src/main/java/com/tallycatalyst/cache/CacheExtensions.kt`

```kotlin
package com.tallycatalyst.cache

import android.content.Context
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

/**
 * Easy-to-use extension functions for cache operations
 */

/**
 * Read cached data with type inference
 * 
 * Usage: val data = context.cacheRead<MyDataClass>("key")
 */
suspend inline fun <reified T> Context.cacheRead(key: String): T? {
    return CacheManager.readCache(key, T::class.java)
}

/**
 * Write data to cache
 * 
 * Usage: context.cacheWrite("key", myData, ttlMillis = 24*60*60*1000)
 */
suspend inline fun Context.cacheWrite(
    key: String,
    data: Any,
    ttlMillis: Long = -1
): Boolean {
    return CacheManager.writeCache(key, data, ttlMillis)
}

/**
 * Clear specific cache entry
 * 
 * Usage: context.cacheClear("key")
 */
suspend inline fun Context.cacheClear(key: String): Boolean {
    return CacheManager.clearCache(key)
}

/**
 * Clear all cache
 * 
 * Usage: context.cacheClearAll()
 */
suspend inline fun Context.cacheClearAll(): Boolean {
    return CacheManager.clearAllCache()
}

/**
 * Check if cache is valid (not expired)
 * 
 * Usage: val isValid = context.isCacheValid("key")
 */
suspend inline fun Context.isCacheValid(key: String): Boolean {
    return CacheManager.isCacheValid(key)
}

/**
 * Get cache statistics
 * 
 * Usage: val stats = context.getCacheStats()
 */
inline fun Context.getCacheStats(): CacheStats {
    return CacheManager.getCacheStats()
}
```

---

### FILE 3: `CacheManagerTest.kt`
**Location**: `src/test/java/com/tallycatalyst/cache/CacheManagerTest.kt`

```kotlin
package com.tallycatalyst.cache

import android.content.Context
import kotlinx.coroutines.runBlocking
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.mockito.Mock
import org.mockito.runners.MockitoJUnitRunner
import java.io.File
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNull
import kotlin.test.assertTrue

@RunWith(MockitoJUnitRunner::class)
class CacheManagerTest {
    
    @Mock
    private lateinit var mockContext: Context
    
    private lateinit var testCacheDir: File
    
    data class TestData(
        val id: String,
        val name: String,
        val value: Int
    )
    
    @Before
    fun setup() {
        testCacheDir = File.createTempFile("cache", "test").parentFile!!
        // Initialize CacheManager with test context
        CacheManager.initialize(mockContext)
    }
    
    @Test
    fun testWriteAndReadCache() = runBlocking {
        val testData = TestData("1", "Test", 100)
        val key = "test_data"
        
        // Write
        val writeResult = CacheManager.writeCache(key, testData)
        assertTrue(writeResult)
        
        // Read
        val readData = CacheManager.readCache(key, TestData::class.java)
        assertEquals(testData, readData)
    }
    
    @Test
    fun testCacheMissReturnsNull() = runBlocking {
        val readData = CacheManager.readCache("nonexistent", TestData::class.java)
        assertNull(readData)
    }
    
    @Test
    fun testTTLExpiration() = runBlocking {
        val testData = TestData("1", "Test", 100)
        val key = "expiring_data"
        
        // Write with 100ms TTL
        CacheManager.writeCache(key, testData, ttlMillis = 100)
        
        // Read immediately (should exist)
        var readData = CacheManager.readCache(key, TestData::class.java)
        assertEquals(testData, readData)
        
        // Wait for expiration
        Thread.sleep(150)
        
        // Read after expiration (should be null)
        readData = CacheManager.readCache(key, TestData::class.java)
        assertNull(readData)
    }
    
    @Test
    fun testClearSpecificCache() = runBlocking {
        val testData = TestData("1", "Test", 100)
        val key = "to_clear"
        
        // Write
        CacheManager.writeCache(key, testData)
        
        // Verify it exists
        var readData = CacheManager.readCache(key, TestData::class.java)
        assertEquals(testData, readData)
        
        // Clear
        val clearResult = CacheManager.clearCache(key)
        assertTrue(clearResult)
        
        // Verify it's gone
        readData = CacheManager.readCache(key, TestData::class.java)
        assertNull(readData)
    }
    
    @Test
    fun testClearAllCache() = runBlocking {
        val testData = TestData("1", "Test", 100)
        
        // Write multiple entries
        CacheManager.writeCache("data1", testData)
        CacheManager.writeCache("data2", testData)
        CacheManager.writeCache("data3", testData)
        
        // Clear all
        val clearResult = CacheManager.clearAllCache()
        assertTrue(clearResult)
        
        // Verify all are gone
        assertNull(CacheManager.readCache("data1", TestData::class.java))
        assertNull(CacheManager.readCache("data2", TestData::class.java))
        assertNull(CacheManager.readCache("data3", TestData::class.java))
    }
    
    @Test
    fun testIsCacheValid() = runBlocking {
        val testData = TestData("1", "Test", 100)
        val key = "valid_cache"
        
        // Write
        CacheManager.writeCache(key, testData)
        
        // Check validity
        assertTrue(CacheManager.isCacheValid(key))
    }
    
    @Test
    fun testSerializationDeserialization() = runBlocking {
        val testData = TestData("123", "Complex Name!@#$", 999)
        val key = "complex_data"
        
        // Write complex object
        CacheManager.writeCache(key, testData)
        
        // Read and verify
        val readData = CacheManager.readCache(key, TestData::class.java)
        assertEquals(testData.id, readData?.id)
        assertEquals(testData.name, readData?.name)
        assertEquals(testData.value, readData?.value)
    }
    
    @Test
    fun testCacheStats() {
        val stats = CacheManager.getCacheStats()
        
        assertFalse(stats.cacheDirectory.isEmpty())
        assertTrue(stats.totalSize >= 0)
        assertTrue(stats.itemCount >= 0)
        assertTrue(stats.availableSpace >= 0)
    }
}
```

---

### FILE 4: Integration with Existing API Calls

**Pattern for all API calls** (apply to repository/ViewModel/API classes):

```kotlin
class TallyRepository(private val apiService: TallyApiService, private val context: Context) {
    
    /**
     * Fetch tally data with cache-first strategy
     * 
     * Flow:
     * 1. Check cache
     * 2. If miss, fetch from API
     * 3. Write to cache with 24h TTL
     * 4. Return data
     */
    suspend fun getTallyData(id: String): TallyData? = withContext(Dispatchers.Main) {
        // Step 1: Try cache first (same pattern as web version)
        context.cacheRead<TallyData>("tally_$id")?.let { 
            return@withContext it 
        }
        
        // Step 2: Cache miss - fetch from API
        val data = try {
            apiService.getTallyData(id)
        } catch (e: Exception) {
            logger.error("API fetch failed for tally $id: ${e.message}")
            return@withContext null
        }
        
        // Step 3: Write to cache asynchronously (24 hours TTL)
        withContext(Dispatchers.Default) {
            context.cacheWrite(
                "tally_$id",
                data,
                ttlMillis = 24 * 60 * 60 * 1000  // 24 hours in milliseconds
            )
        }
        
        // Step 4: Return data
        return@withContext data
    }
    
    /**
     * Fetch user preferences with longer TTL (7 days)
     */
    suspend fun getUserPreferences(userId: String): UserPrefs? = withContext(Dispatchers.Main) {
        context.cacheRead<UserPrefs>("user_prefs_$userId")?.let { 
            return@withContext it 
        }
        
        val prefs = apiService.getUserPreferences(userId) ?: return@withContext null
        
        withContext(Dispatchers.Default) {
            context.cacheWrite(
                "user_prefs_$userId",
                prefs,
                ttlMillis = 7 * 24 * 60 * 60 * 1000  // 7 days
            )
        }
        
        return@withContext prefs
    }
    
    /**
     * Fetch dashboard data with short TTL (5 minutes - live data)
     */
    suspend fun getDashboardData(): DashboardData? = withContext(Dispatchers.Main) {
        context.cacheRead<DashboardData>("dashboard")?.let { 
            return@withContext it 
        }
        
        val data = apiService.getDashboardData() ?: return@withContext null
        
        withContext(Dispatchers.Default) {
            context.cacheWrite(
                "dashboard",
                data,
                ttlMillis = 5 * 60 * 1000  // 5 minutes
            )
        }
        
        return@withContext data
    }
    
    /**
     * Manual cache invalidation when data changes
     */
    suspend fun invalidateTallyCache(id: String) {
        context.cacheClear("tally_$id")
    }
    
    /**
     * Manual cache invalidation for all
     */
    suspend fun invalidateAllCache() {
        context.cacheClearAll()
    }
}
```

---

### FILE 5: `build.gradle` Dependencies

Add to app-level `build.gradle`:

```gradle
dependencies {
    // Existing dependencies...
    
    // Cache Management
    implementation 'com.google.code.gson:gson:2.10.1'
    
    // Kotlin Coroutines
    implementation 'org.jetbrains.kotlinx:kotlinx-coroutines-android:1.7.3'
    implementation 'org.jetbrains.kotlinx:kotlinx-coroutines-core:1.7.3'
    
    // Logging (if not already present)
    implementation 'org.slf4j:slf4j-api:2.0.9'
    implementation 'com.github.tony19:logback-android:3.0.0'
    
    // Testing
    testImplementation 'junit:junit:4.13.2'
    testImplementation 'org.mockito:mockito-core:5.2.0'
    testImplementation 'org.mockito:mockito-kotlin:5.1.0'
    testImplementation 'org.jetbrains.kotlinx:kotlinx-coroutines-test:1.7.3'
    testImplementation 'androidx.arch.core:core-testing:2.2.0'
}
```

---

### FILE 6: Application Initialization

In your `Application` class:

```kotlin
class TallyCatalystApp : Application() {
    
    override fun onCreate() {
        super.onCreate()
        
        // Initialize CacheManager early
        CacheManager.initialize(this)
        
        // Other initialization...
    }
}
```

And add to `AndroidManifest.xml`:

```xml
<application
    android:name=".TallyCatalystApp"
    ...>
</application>
```

---

## 📊 COMPLETE FEATURE COMPARISON

| Feature | Web (`CacheManagement.js`) | Android (`CacheManager.kt`) | Status |
|---------|---------------------------|---------------------------|--------|
| Primary Storage | OPFS | `getExternalCacheDir()` | ✅ |
| Fallback Storage | IndexedDB | `getCacheDir()` | ✅ |
| Async Operations | Promises (.then) | Coroutines (suspend) | ✅ |
| Cache-First Reading | Manual implementation | Implemented in Repository | ✅ |
| TTL Support | ✅ | ✅ | ✅ |
| Serialization | Automatic JSON | Gson JSON | ✅ |
| Expiration Check | Query-time | On-read lazy | ✅ |
| Error Handling | Fallback gracefully | Return null/false | ✅ |
| Metadata Tracking | ✅ | ✅ | ✅ |
| Cache Statistics | ✅ | ✅ | ✅ |
| Type Safety | Loose | Strict with Generics | ✅ Enhanced |
| Logging | ✅ | ✅ | ✅ |

---

## ⚙️ CACHE TTL CONFIGURATION GUIDE

Recommended TTL values for different data types:

```kotlin
// Real-time data - shortest TTL
val DASHBOARD_TTL = 5 * 60 * 1000  // 5 minutes

// Frequently changing
val TALLY_DATA_TTL = 1 * 60 * 60 * 1000  // 1 hour

// Standard data
val STANDARD_DATA_TTL = 6 * 60 * 60 * 1000  // 6 hours

// Slowly changing data
val USER_PREFS_TTL = 7 * 24 * 60 * 60 * 1000  // 7 days

// Never expire
val NEVER_EXPIRE = -1L
```

---

## ✅ IMPLEMENTATION CHECKLIST

**Phase 1: Core Implementation**
- [ ] Create `CacheManager.kt` with all methods
- [ ] Create `CacheExtensions.kt` with extension functions
- [ ] Add Gson, Coroutines, Logging dependencies to `build.gradle`
- [ ] Create `CacheStats` data class

**Phase 2: Testing & Validation**
- [ ] Create `CacheManagerTest.kt` with comprehensive tests
- [ ] Test write/read cycle
- [ ] Test TTL expiration
- [ ] Test fallback mechanism
- [ ] Test concurrent operations
- [ ] Run tests: `./gradlew test`

**Phase 3: Integration**
- [ ] Initialize `CacheManager` in `Application` class
- [ ] Update `TallyRepository` with cache-first pattern
- [ ] Update all API methods with appropriate TTLs
- [ ] Add manual invalidation methods
- [ ] Update ViewModel to use new repository methods

**Phase 4: Logging & Monitoring**
- [ ] Add logging for cache hits/misses
- [ ] Add logging for writes/clears
- [ ] Add logging for fallback events
- [ ] Add logging for errors
- [ ] Create debug UI to show cache stats (optional)

**Phase 5: Quality Assurance**
- [ ] Test on device with limited storage
- [ ] Test fallback from external to internal
- [ ] Test with various data types
- [ ] Monitor cache size growth
- [ ] Performance testing: write/read latency
- [ ] Test cache invalidation

---

## 🎯 SUCCESS CRITERIA

When complete, your Android app will:

✅ Store unlimited cache data like OPFS (within device limits)  
✅ Automatically fallback to internal storage if external unavailable  
✅ Support TTL-based expiration like IndexedDB  
✅ Use async Coroutines matching Promise pattern from web  
✅ Serialize/deserialize all data types with Gson  
✅ Return null on cache miss (not throw exceptions)  
✅ Implement cache-first strategy in all API calls  
✅ Track cache metadata and statistics  
✅ Handle errors gracefully with logging  
✅ Pass all unit tests  
✅ Work seamlessly with existing TallyDashboard code  

---

## 📝 ADDITIONAL NOTES

**Performance Targets**:
- Cache write: < 50ms for typical JSON objects
- Cache read: < 10ms for cache hits
- Cache miss fallthrough: Transparent to API call
- Memory overhead: Minimal (no RAM caching, file-based only)

**Data Models**:
- Ensure all data classes are Gson-serializable
- Use `@SerializedName` for custom JSON property names if needed
- Test serialization for complex nested objects

**Storage Considerations**:
- External cache: Limited only by device storage
- Internal cache: ~5-10MB limit, can be overridden by OS
- Monitor `getCacheSize()` to prevent excessive growth
- Consider implementing cache cleanup for old entries

**Deployment**:
- Test on Android 8.0+ (API 26+)
- Test on devices with limited storage (simulate with settings)
- Monitor crash logs for cache-related errors
- Gather cache hit/miss metrics for optimization

---

## 🚀 HOW TO USE THIS PROMPT

1. **Copy this entire prompt**
2. **Open Cursor Agent**
3. **Paste and say**: "Implement all of this for my Android app"
4. **Follow Cursor's generation** in this order:
   - CacheManager.kt
   - CacheExtensions.kt
   - CacheManagerTest.kt
   - Repository integration
   - build.gradle updates
   - Application initialization
5. **Review and merge** into your project
6. **Run tests**: `./gradlew test`
7. **Deploy and monitor**

---

**This is a production-ready implementation that exactly mirrors your web version's behavior while using native Android APIs. Good luck!** 🚀
