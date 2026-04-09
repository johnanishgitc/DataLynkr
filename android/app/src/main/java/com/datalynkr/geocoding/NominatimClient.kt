package com.datalynkr.geocoding

import okhttp3.Interceptor
import okhttp3.OkHttpClient
import okhttp3.Response
import okhttp3.logging.HttpLoggingInterceptor
import retrofit2.Retrofit
import retrofit2.converter.gson.GsonConverterFactory
import java.util.concurrent.TimeUnit

private const val BASE_URL   = "https://nominatim.openstreetmap.org/"
private const val USER_AGENT = "DataLynkr-Android/1.0 (contact@datalynkr.com)"

/**
 * OkHttp interceptor that injects the required Nominatim User-Agent header
 * on every request and sets Referer for open-source compliance.
 */
private class UserAgentInterceptor : Interceptor {
    override fun intercept(chain: Interceptor.Chain): Response {
        val request = chain.request().newBuilder()
            .header("User-Agent", USER_AGENT)
            .header("Referer", "https://datalynkr.com")
            .build()
        return chain.proceed(request)
    }
}

/**
 * Singleton Retrofit client scoped to the Nominatim base URL.
 * Exposes a single [NominatimApiService] instance ready for injection or
 * direct use in a repository.
 */
object NominatimClient {

    private val loggingInterceptor = HttpLoggingInterceptor().apply {
        level = HttpLoggingInterceptor.Level.BASIC
    }

    private val okHttpClient: OkHttpClient = OkHttpClient.Builder()
        .addInterceptor(UserAgentInterceptor())
        .addInterceptor(loggingInterceptor)
        .connectTimeout(15, TimeUnit.SECONDS)
        .readTimeout(15, TimeUnit.SECONDS)
        .build()

    private val retrofit: Retrofit = Retrofit.Builder()
        .baseUrl(BASE_URL)
        .client(okHttpClient)
        .addConverterFactory(GsonConverterFactory.create())
        .build()

    val apiService: NominatimApiService = retrofit.create(NominatimApiService::class.java)
}
