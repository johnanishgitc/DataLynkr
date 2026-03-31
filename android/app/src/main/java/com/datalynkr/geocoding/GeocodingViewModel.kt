package com.datalynkr.geocoding

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

/**
 * UI state for a reverse-geocoding operation.
 */
sealed class GeocodingUiState {
    object Idle                                 : GeocodingUiState()
    object Loading                              : GeocodingUiState()
    data class Success(val address: GeoAddress) : GeocodingUiState()
    data class Error(val message: String)       : GeocodingUiState()
    object RateLimited                          : GeocodingUiState()
}

/**
 * ViewModel that exposes [fetchAddress] for use in Compose or traditional
 * View-based UIs. Observe [uiState] to react to loading / success / error.
 *
 * Example (Compose):
 * ```kotlin
 * val vm: GeocodingViewModel = viewModel()
 * val state by vm.uiState.collectAsStateWithLifecycle()
 *
 * Button(onClick = { vm.fetchAddress(lat, lon) }) { Text("Record Location") }
 *
 * when (val s = state) {
 *     is GeocodingUiState.Success -> {
 *         countryField = s.address.country
 *         stateField   = s.address.state
 *         pincodeField = s.address.pincode
 *     }
 *     is GeocodingUiState.Error       -> showSnackbar(s.message)
 *     is GeocodingUiState.RateLimited -> showSnackbar("Please wait a moment…")
 *     else -> Unit
 * }
 * ```
 */
class GeocodingViewModel(
    private val repository: GeocodingRepository = GeocodingRepository,
) : ViewModel() {

    private val _uiState = MutableStateFlow<GeocodingUiState>(GeocodingUiState.Idle)
    val uiState: StateFlow<GeocodingUiState> = _uiState.asStateFlow()

    /**
     * Triggers a reverse-geocode look-up for [latitude] / [longitude].
     * Safe to call from any thread; work is dispatched on [viewModelScope].
     */
    fun fetchAddress(latitude: Double, longitude: Double) {
        viewModelScope.launch {
            _uiState.value = GeocodingUiState.Loading

            _uiState.value = when (val result = repository.reverseGeocode(latitude, longitude)) {
                is GeoResult.Success     -> GeocodingUiState.Success(result.address)
                is GeoResult.Error       -> GeocodingUiState.Error(result.message)
                is GeoResult.RateLimited -> GeocodingUiState.RateLimited
            }
        }
    }

    /** Reset state back to [GeocodingUiState.Idle] (e.g. after consuming a result). */
    fun resetState() {
        _uiState.value = GeocodingUiState.Idle
    }
}
