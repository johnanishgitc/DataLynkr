package com.datalynkr.geocoding

import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock

/**
 * Sealed result wrapper so callers never receive raw exceptions.
 */
sealed class GeoResult {
    data class Success(val address: GeoAddress) : GeoResult()
    data class Error(val message: String)       : GeoResult()
    object RateLimited                          : GeoResult()
}

/**
 * Repository that wraps [NominatimApiService] and enforces a minimum
 * 2-second gap between outgoing requests (Nominatim's open-source policy
 * requires ≤ 1 req/sec; 2 s gives a comfortable safety margin).
 *
 * Usage:
 * ```kotlin
 * val result = GeocodingRepository.reverseGeocode(lat = 12.97, lon = 77.59)
 * ```
 */
object GeocodingRepository {

    private const val MIN_INTERVAL_MS = 2_000L

    private val mutex              = Mutex()
    private var lastRequestTimeMs  = 0L

    /**
     * Reverse-geocode [latitude]/[longitude] into a [GeoAddress].
     *
     * Must be called from a coroutine (suspend function).
     * Thread-safe: a [Mutex] ensures only one request is in-flight at a time
     * and the 2-second cooldown is evaluated atomically.
     *
     * @return [GeoResult.Success]      when the API returns a valid address.
     *         [GeoResult.RateLimited]  when called again before 2 s have elapsed.
     *         [GeoResult.Error]        on any network or parsing failure.
     */
    suspend fun reverseGeocode(latitude: Double, longitude: Double): GeoResult =
        mutex.withLock {
            val now = System.currentTimeMillis()
            if (now - lastRequestTimeMs < MIN_INTERVAL_MS) {
                return@withLock GeoResult.RateLimited
            }

            return@withLock try {
                val response = NominatimClient.apiService.reverseGeocode(
                    lat = latitude,
                    lon = longitude,
                )
                lastRequestTimeMs = System.currentTimeMillis()
                GeoResult.Success(response.toGeoAddress())
            } catch (e: Exception) {
                GeoResult.Error(e.message ?: "Unknown error during reverse geocoding")
            }
        }
}
