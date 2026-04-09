package com.datalynkr.geocoding

import retrofit2.http.GET
import retrofit2.http.Query

/**
 * Retrofit interface for Nominatim reverse-geocoding.
 *
 * Base URL: https://nominatim.openstreetmap.org/
 *
 * Required open-source attribution:
 *   - User-Agent header is added by [NominatimClient] via OkHttp interceptor.
 *   - format=jsonv2 and addressdetails=1 are fixed query params below.
 */
interface NominatimApiService {

    /**
     * Reverse-geocode a coordinate pair.
     *
     * @param lat Latitude (decimal degrees, e.g. 12.971599)
     * @param lon Longitude (decimal degrees, e.g. 77.594563)
     */
    @GET("reverse")
    suspend fun reverseGeocode(
        @Query("lat")            lat:            Double,
        @Query("lon")            lon:            Double,
        @Query("format")         format:         String = "jsonv2",
        @Query("addressdetails") addressDetails: Int    = 1,
    ): NominatimResponse
}
