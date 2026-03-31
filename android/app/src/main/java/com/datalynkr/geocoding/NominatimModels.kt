package com.datalynkr.geocoding

import com.google.gson.annotations.SerializedName

/**
 * Clean domain object returned to callers; all fields are safe (never null).
 */
data class GeoAddress(
    val fullAddress: String,
    val country: String,
    val state: String,
    val pincode: String,
)

// ── Raw Nominatim response ────────────────────────────────────────────────────

data class NominatimResponse(
    @SerializedName("display_name") val displayName: String?,
    @SerializedName("address")      val address: NominatimAddress?,
)

data class NominatimAddress(
    // administrative levels — Nominatim uses different keys per region
    @SerializedName("state")            val state: String?,
    @SerializedName("province")         val province: String?,
    @SerializedName("region")           val region: String?,
    @SerializedName("county")           val county: String?,
    @SerializedName("country")          val country: String?,
    @SerializedName("postcode")         val postcode: String?,
    @SerializedName("road")             val road: String?,
    @SerializedName("suburb")           val suburb: String?,
    @SerializedName("city")             val city: String?,
    @SerializedName("town")             val town: String?,
    @SerializedName("village")          val village: String?,
) {
    /** Returns the most specific administrative area available as "state". */
    fun resolvedState(): String =
        state ?: province ?: region ?: county ?: ""

    /** Best-effort locality string for the full address. */
    fun resolvedLocality(): String =
        city ?: town ?: village ?: suburb ?: ""
}

// ── Extension: map raw response → GeoAddress ─────────────────────────────────

fun NominatimResponse.toGeoAddress(): GeoAddress {
    val addr = address
    return GeoAddress(
        fullAddress = displayName ?: "",
        country     = addr?.country  ?: "",
        state       = addr?.resolvedState() ?: "",
        pincode     = addr?.postcode ?: "",
    )
}
