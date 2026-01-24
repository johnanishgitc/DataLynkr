# Sales Dashboard Migration Guide: React → Native Android

## 📋 Overview

This document outlines the complete migration of the TallyCatalyst Sales Dashboard from React web to native Android using Jetpack Compose, Room Database, and Vico charting library.

---

## ✅ Completed Components

### 1. Data Models (`SalesModels.kt`) ✓
- **SalesVoucher**: Core voucher model with all fields
- **LedgerEntry, InventoryEntry**: Nested data structures
- **FieldMetadata**: Dynamic field extraction support
- **KPIData, ChartDataPoint**: Chart and metric models
- **SalesFilters, DateRange**: Filtering state management

### 2. Field Extractor Utility (`FieldExtractor.kt`) ✓
- **Hierarchy detection**: Voucher, Ledger, Inventory levels
- **Field type detection**: Category vs Value (numeric)
- **Dot notation path traversal**: `ledgerentries.amount`
- **Label formatting**: Convert camelCase to "Title Case"
- **Nested value extraction**: Handle arrays and objects

### 3. Room Database (`SalesDatabase.kt`) ✓
- **SalesVoucherEntity**: Optimized database entity with indexes
- **SalesCacheMetadataEntity**: Track cache state per company
- **SalesDao**: CRUD operations + advanced queries
- **CacheMetadataDao**: Metadata management
- **SalesRepository**: Clean architecture data access layer

### 4. Build Configuration (`build.gradle`) ✓
Added dependencies:
- Jetpack Compose BOM (Material3)
- Room Database 2.6.1
- Retrofit 2.9.0 + OkHttp
- Vico Charts 1.13.1
- Kotlinx Serialization & Coroutines
- Accompanist utilities

---

## 📦 Remaining Components to Implement

### 5. Retrofit API Service (`SalesApiService.kt`)

```kotlin
package com.datalynkr.sales.api

interface SalesApiService {
    @POST("tally/tallydata")
    suspend fun fetchSalesData(
        @Body request: TallyDataRequest,
        @Header("Authorization") token: String
    ): Response<TallyDataResponse>
    
    @GET("custom-card/get")
    suspend fun getCustomCards(
        @Query("tallylocId") tallylocId: String,
        @Query("coGuid") guid: String,
        @Query("dashboardType") dashboardType: String = "sales"
    ): Response<CustomCardsResponse>
}

data class TallyDataRequest(
    val tallyloc_id: String,
    val company: String,
    val guid: String,
    val request: String // XML request body
)
```

**Key Points**:
- Fetch sales vouchers from Tally via backend API
- Support date range queries
- Handle company configurations (salesperson formula, UDF config)

---

### 6. Sales Dashboard ViewModel (`SalesDashboardViewModel.kt`)

```kotlin
@HiltViewModel
class SalesDashboardViewModel @Inject constructor(
    private val repository: SalesRepository,
    private val apiService: SalesApiService,
    private val savedStateHandle: SavedStateHandle
) : ViewModel() {
    
    // State management using Compose State
    private val _salesData = MutableStateFlow<List<SalesVoucher>>(emptyList())
    val salesData: StateFlow<List<SalesVoucher>> = _salesData.asStateFlow()
    
    private val _filters = MutableStateFlow(SalesFilters(
        dateRange = DateRange(
            start = getCurrentFinancialYearStart(),
            end = getCurrentDate()
        )
    ))
    val filters: StateFlow<SalesFilters> = _filters.asStateFlow()
    
    private val _loading = MutableStateFlow(false)
    val loading: StateFlow<Boolean> = _loading.asStateFlow()
    
    private val _error = MutableStateFlow<String?>(null)
    val error: StateFlow<String?> = _error.asStateFlow()
    
    // Cache download progress
    private val _downloadProgress = MutableStateFlow<DownloadProgress?>(null)
    val downloadProgress: StateFlow<DownloadProgress?> = _downloadProgress.asStateFlow()
    
    // KPI calculations (derived state)
    val totalRevenue: StateFlow<Double> = salesData.map { vouchers ->
        vouchers.sumOf { it.amount }
    }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), 0.0)
    
    val totalInvoices: StateFlow<Int> = salesData.map { it.size }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), 0)
    
    val uniqueCustomers: StateFlow<Int> = salesData.map { vouchers ->
        vouchers.mapNotNull { it.partyledgername }.distinct().size
    }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), 0)
    
    val avgInvoiceValue: StateFlow<Double> = combine(totalRevenue, totalInvoices) { revenue, invoices ->
        if (invoices > 0) revenue / invoices else 0.0
    }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), 0.0)
    
    // Chart data (derived state)
    val salesByCustomer: StateFlow<List<ChartDataPoint>> = salesData.map { vouchers ->
        aggregateByField(vouchers, "customer")
    }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList())
    
    // Functions
    fun loadSalesData() {
        viewModelScope.launch {
            _loading.value = true
            _error.value = null
            
            try {
                val companyGuid = getCurrentCompanyGuid()
                val (startDate, endDate) = filters.value.dateRange.let { it.start to it.end }
                
                // First try to load from cache
                val cachedVouchers = repository.getVouchersByDateRange(companyGuid, startDate, endDate)
                
                if (cachedVouchers.isNotEmpty()) {
                    _salesData.value = cachedVouchers.map { it.toSalesVoucher() }
                } else {
                    // Fetch from API if cache empty
                    fetchFromApi(companyGuid, startDate, endDate)
                }
            } catch (e: Exception) {
                _error.value = "Failed to load sales data: ${e.message}"
            } finally {
                _loading.value = false
            }
        }
    }
    
    fun updateFilter(newFilters: SalesFilters) {
        _filters.value = newFilters
        loadSalesData() // Reload with new filters
    }
    
    fun downloadCompleteCache() {
        viewModelScope.launch {
            // Implement cache sync with progress tracking
            // Similar to cacheSyncManager.subscribe() in React code
        }
    }
    
    private suspend fun fetchFromApi(companyGuid: String, startDate: String, endDate: String) {
        // Call API, parse response, save to Room database
    }
}
```

**Key Features**:
- `StateFlow` for reactive state (replaces React `useState`)
- `viewModelScope.launch` for coroutines (replaces React `useEffect`)
- Derived state with `.map()` and `combine()` (replaces React `useMemo`)
- Survives configuration changes automatically

---

### 7. KPI Card Composables (`KPICards.kt`)

```kotlin
@Composable
fun KPICard(
    title: String,
    value: Double,
    target: Double? = null,
    trendData: List<Double> = emptyList(),
    format: (Double) -> String = { it.toString() },
    unit: String = "",
    iconName: String? = null,
    iconBgColor: Color = Color(0xFFDCFCE7),
    iconColor: Color = Color(0xFF16A34A),
    modifier: Modifier = Modifier
) {
    Card(
        modifier = modifier
            .fillMaxWidth()
            .height(120.dp),
        elevation = CardDefaults.cardElevation(defaultElevation = 2.dp),
        colors = CardDefaults.cardColors(containerColor = Color.White)
    ) {
        Box(modifier = Modifier.fillMaxSize()) {
            // Background trend area chart (optional)
            if (trendData.isNotEmpty()) {
                TrendAreaChart(
                    data = trendData,
                    color = iconColor.copy(alpha = 0.15f),
                    modifier = Modifier
                        .fillMaxSize()
                        .align(Alignment.BottomCenter)
                )
            }
            
            // Icon in bottom right
            iconName?.let {
                Icon(
                    imageVector = getIconByName(it),
                    contentDescription = null,
                    tint = iconColor,
                    modifier = Modifier
                        .size(48.dp)
                        .align(Alignment.BottomEnd)
                        .padding(12.dp)
                        .background(iconBgColor, shape = RoundedCornerShape(8.dp))
                        .padding(8.dp)
                )
            }
            
            // Content
            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(16.dp),
                verticalArrangement = Arrangement.Top
            ) {
                // Title
                Text(
                    text = title.uppercase(),
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    letterSpacing = 0.05.em
                )
                
                Spacer(modifier = Modifier.height(4.dp))
                
                // Value
                Text(
                    text = format(value) + unit,
                    style = MaterialTheme.typography.headlineSmall,
                    fontWeight = FontWeight.Bold,
                    color = iconColor
                )
                
                // Target (optional)
                target?.let {
                    val diff = value - it
                    val diffText = if (diff >= 0) "+${format(diff)}" else format(diff)
                    
                    Text(
                        text = "Target: ${format(it)}$unit ($diffText)",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
            }
        }
    }
}

@Composable
fun MetricCard(
    title: String,
    value: String,
    icon: ImageVector,
    color: Color = Color(0xFF0D6464),
    modifier: Modifier = Modifier
) {
    Card(
        modifier = modifier.fillMaxWidth(),
        elevation = CardDefaults.cardElevation(defaultElevation = 2.dp)
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(16.dp),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = title.uppercase(),
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
                Text(
                    text = value,
                    style = MaterialTheme.typography.headlineMedium,
                    fontWeight = FontWeight.Bold
                )
            }
            
            Box(
                modifier = Modifier
                    .size(56.dp)
                    .background(color.copy(alpha = 0.1f), shape = RoundedCornerShape(12.dp)),
                contentAlignment = Alignment.Center
            ) {
                Icon(
                    imageVector = icon,
                    contentDescription = null,
                    tint = color,
                    modifier = Modifier.size(32.dp)
                )
            }
        }
    }
}
```

---

### 8. Chart Composables with Vico (`SalesCharts.kt`)

```kotlin
@Composable
fun BarChartCard(
    title: String,
    data: List<ChartDataPoint>,
    valuePrefix: String = "₹",
    onBarClick: ((String) -> Unit)? = null,
    modifier: Modifier = Modifier
) {
    Card(
        modifier = modifier.fillMaxWidth(),
        elevation = CardDefaults.cardElevation(defaultElevation = 2.dp)
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(16.dp)
        ) {
            // Header
            Text(
                text = title,
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.Bold
            )
            
            Spacer(modifier = Modifier.height(16.dp))
            
            // Vico Column Chart
            if (data.isNotEmpty()) {
                val chartEntryModel = entryModelOf(
                    data.mapIndexed { index, point -> 
                        entryOf(index.toFloat(), point.value.toFloat())
                    }
                )
                
                Chart(
                    chart = columnChart(),
                    model = chartEntryModel,
                    startAxis = rememberStartAxis(
                        label = rememberAxisLabelComponent(),
                        axis = rememberAxisLineComponent()
                    ),
                    bottomAxis = rememberBottomAxis(
                        label = rememberAxisLabelComponent(),
                        valueFormatter = { value, _ -> 
                            data.getOrNull(value.toInt())?.label ?: ""
                        }
                    ),
                    marker = rememberMarker(), // Tooltip
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(300.dp)
                )
            }
        }
    }
}

@Composable
fun LineChartCard(
    title: String,
    data: List<ChartDataPoint>,
    valuePrefix: String = "₹",
    modifier: Modifier = Modifier
) {
    Card(
        modifier = modifier.fillMaxWidth(),
        elevation = CardDefaults.cardElevation(defaultElevation = 2.dp)
    ) {
        Column(modifier = Modifier.padding(16.dp)) {
            Text(
                text = title,
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.Bold
            )
            
            Spacer(modifier = Modifier.height(16.dp))
            
            val chartEntryModel = entryModelOf(
                data.mapIndexed { index, point -> 
                    entryOf(index.toFloat(), point.value.toFloat())
                }
            )
            
            Chart(
                chart = lineChart(
                    lines = listOf(
                        LineChart.LineSpec(
                            lineColor = Color(0xFF0D6464).toArgb(),
                            lineBackgroundShader = DynamicShaders.fromBrush(
                                Brush.verticalGradient(
                                    listOf(
                                        Color(0xFF0D6464).copy(alpha = 0.25f),
                                        Color.Transparent
                                    )
                                )
                            )
                        )
                    )
                ),
                model = chartEntryModel,
                startAxis = rememberStartAxis(),
                bottomAxis = rememberBottomAxis(
                    valueFormatter = { value, _ -> 
                        data.getOrNull(value.toInt())?.label ?: ""
                    }
                ),
                modifier = Modifier
                    .fillMaxWidth()
                    .height(300.dp)
            )
        }
    }
}

@Composable
fun PieChartCard(
    title: String,
    data: List<ChartDataPoint>,
    valuePrefix: String = "₹",
    onSliceClick: ((String) -> Unit)? = null,
    modifier: Modifier = Modifier
) {
    // Use Android Canvas or external Pie chart library
    // Vico doesn't natively support Pie charts - use MPAndroidChart or custom Canvas
}
```

**Library Recommendation**:
- **Vico**: Excellent for Bar, Line, Stacked charts
- **MPAndroidChart**: If you need Pie, Radar, or complex charts
- **Google Maps Android API**: For Geo/Map visualizations

---

### 9. Main Dashboard Screen (`SalesDashboardScreen.kt`)

```kotlin
@Composable
fun SalesDashboardScreen(
    viewModel: SalesDashboardViewModel = hiltViewModel(),
    onNavigateToDetails: (String) -> Unit
) {
    val salesData by viewModel.salesData.collectAsState()
    val filters by viewModel.filters.collectAsState()
    val loading by viewModel.loading.collectAsState()
    val error by viewModel.error.collectAsState()
    
    // Derived metrics
    val totalRevenue by viewModel.totalRevenue.collectAsState()
    val totalInvoices by viewModel.totalInvoices.collectAsState()
    val uniqueCustomers by viewModel.uniqueCustomers.collectAsState()
    val avgInvoiceValue by viewModel.avgInvoiceValue.collectAsState()
    
    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Sales Dashboard") },
                actions = {
                    // Filter icon
                    IconButton(onClick = { /* Show filter modal */ }) {
                        Icon(Icons.Default.FilterList, contentDescription = "Filters")
                    }
                    
                    // Refresh/Download icon
                    IconButton(onClick = { viewModel.downloadCompleteCache() }) {
                        Icon(Icons.Default.Refresh, contentDescription = "Refresh")
                    }
                }
            )
        }
    ) { paddingValues ->
        Box(
            modifier = Modifier
                .fillMaxSize()
                .padding(paddingValues)
        ) {
            when {
                loading -> {
                    CircularProgressIndicator(modifier = Modifier.align(Alignment.Center))
                }
                error != null -> {
                    ErrorView(
                        message = error!!,
                        onRetry = { viewModel.loadSalesData() },
                        modifier = Modifier.align(Alignment.Center)
                    )
                }
                else -> {
                    LazyColumn(
                        modifier = Modifier.fillMaxSize(),
                        contentPadding = PaddingValues(16.dp),
                        verticalArrangement = Arrangement.spacedBy(16.dp)
                    ) {
                        // Date Range Filter
                        item {
                            DateRangeSelector(
                                startDate = filters.dateRange.start,
                                endDate = filters.dateRange.end,
                                onDateRangeChange = { start, end ->
                                    viewModel.updateFilter(
                                        filters.copy(dateRange = DateRange(start, end))
                                    )
                                }
                            )
                        }
                        
                        // KPI Cards Row
                        item {
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.spacedBy(12.dp)
                            ) {
                                KPICard(
                                    title = "Total Revenue",
                                    value = totalRevenue,
                                    format = { formatCurrency(it) },
                                    unit = "",
                                    iconName = "trending_up",
                                    iconColor = Color(0xFF0D6464),
                                    iconBgColor = Color(0xFFCCFBF1),
                                    modifier = Modifier.weight(1f)
                                )
                                
                                KPICard(
                                    title = "Total Invoices",
                                    value = totalInvoices.toDouble(),
                                    format = { it.toInt().toString() },
                                    iconName = "receipt",
                                    modifier = Modifier.weight(1f)
                                )
                            }
                        }
                        
                        item {
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.spacedBy(12.dp)
                            ) {
                                KPICard(
                                    title = "Unique Customers",
                                    value = uniqueCustomers.toDouble(),
                                    format = { it.toInt().toString() },
                                    iconName = "people",
                                    iconColor = Color(0xFF3B82F6),
                                    iconBgColor = Color(0xFFDBEAFE),
                                    modifier = Modifier.weight(1f)
                                )
                                
                                KPICard(
                                    title = "Avg Invoice Value",
                                    value = avgInvoiceValue,
                                    format = { formatCurrency(it) },
                                    iconName = "attach_money",
                                    iconColor = Color(0xFF16A34A),
                                    iconBgColor = Color(0xFFDCFCE7),
                                    modifier = Modifier.weight(1f)
                                )
                            }
                        }
                        
                        // Sales by Customer Chart
                        item {
                            val salesByCustomer by viewModel.salesByCustomer.collectAsState()
                            BarChartCard(
                                title = "Top Customers",
                                data = salesByCustomer.take(10),
                                onBarClick = { customerName ->
                                    viewModel.updateFilter(
                                        filters.copy(selectedCustomer = customerName)
                                    )
                                }
                            )
                        }
                        
                        // Sales by Period Chart
                        item {
                            val salesByPeriod by viewModel.salesByPeriod.collectAsState()
                            LineChartCard(
                                title = "Sales Trend",
                                data = salesByPeriod
                            )
                        }
                        
                        // More charts...
                    }
                }
            }
        }
    }
}
```

---

### 10. Cache Synchronization (`CacheSyncManager.kt`)

```kotlin
class CacheSyncManager(
    private val apiService: SalesApiService,
    private val repository: SalesRepository
) {
    
    private val _syncProgress = MutableStateFlow<SyncProgress?>(null)
    val syncProgress: StateFlow<SyncProgress?> = _syncProgress.asStateFlow()
    
    suspend fun syncSalesData(
        companyGuid: String,
        tallylocId: String,
        companyName: String,
        startDate: String,
        endDate: String
    ): Result<Unit> = withContext(Dispatchers.IO) {
        try {
            // Split date range into chunks (5-day chunks like React code)
            val dateChunks = splitDateRange(startDate, endDate, chunkDays = 5)
            val totalChunks = dateChunks.size
            
            dateChunks.forEachIndexed { index, chunk ->
                // Update progress
                _syncProgress.value = SyncProgress(
                    current = index + 1,
                    total = totalChunks,
                    message = "Downloading ${chunk.start} to ${chunk.end}..."
                )
                
                // Fetch data for this chunk
                val response = apiService.fetchSalesData(
                    request = TallyDataRequest(
                        tallyloc_id = tallylocId,
                        company = companyName,
                        guid = companyGuid,
                        request = buildTallyXMLRequest(chunk.start, chunk.end)
                    ),
                    token = "Bearer ${getAuthToken()}"
                )
                
                if (response.isSuccessful) {
                    val voucherEntities = response.body()?.vouchers?.map { voucher ->
                        voucher.toSalesVoucherEntity(companyGuid, tallylocId)
                    } ?: emptyList()
                    
                    // Insert into Room database
                    repository.insertVouchers(voucherEntities)
                } else {
                    return@withContext Result.failure(Exception("API error: ${response.code()}"))
                }
                
                // Delay to avoid overwhelming the server
                delay(100)
            }
            
            // Update metadata
            val metadata = SalesCacheMetadataEntity(
                companyGuid = companyGuid,
                tallylocId = tallylocId,
                companyName = companyName,
                timestamp = System.currentTimeMillis(),
                voucherCount = repository.getVoucherCount(companyGuid),
                startDate = startDate,
                endDate = endDate,
                isComplete = true
            )
            repository.updateMetadata(metadata)
            
            _syncProgress.value = null
            Result.success(Unit)
        } catch (e: Exception) {
            _syncProgress.value = null
            Result.failure(e)
        }
    }
    
    private fun splitDateRange(start: String, end: String, chunkDays: Int = 5): List<DateChunk> {
        val chunks = mutableListOf<DateChunk>()
        var currentStart = LocalDate.parse(start)
        val endDate = LocalDate.parse(end)
        
        while (currentStart <= endDate) {
            val currentEnd = (currentStart.plusDays(chunkDays.toLong() - 1)).coerceAtMost(endDate)
            chunks.add(DateChunk(currentStart.toString(), currentEnd.toString()))
            currentStart = currentEnd.plusDays(1)
        }
        
        return chunks
    }
}

data class SyncProgress(
    val current: Int,
    val total: Int,
    val message: String
)

data class DateChunk(val start: String, val end: String)
```

---

## 🗺️ Architecture Overview

```
┌─────────────────────────────────────────┐
│         SalesDashboardScreen            │
│         (Jetpack Compose UI)            │
└───────────────┬─────────────────────────┘
                │
                ▼
┌─────────────────────────────────────────┐
│      SalesDashboardViewModel            │
│      (State Management + Logic)         │
└───────────┬─────────────┬───────────────┘
            │             │
            ▼             ▼
┌─────────────────┐   ┌──────────────────┐
│ SalesRepository │   │ CacheSyncManager │
│  (Data Layer)   │   │  (Sync Logic)    │
└────────┬────────┘   └────────┬─────────┘
         │                     │
         ▼                     ▼
┌─────────────────┐   ┌──────────────────┐
│  Room Database  │   │ Retrofit API     │
│  (Local Cache)  │   │ (Tally Backend)  │
└─────────────────┘   └──────────────────┘
```

---

## 🎨 UI Components Mapping

| React Component | Android Compose Equivalent |
|----------------|---------------------------|
| `<div>` | `Box`, `Column`, `Row` |
| `useState` | `remember { mutableStateOf() }` |
| `useEffect` | `LaunchedEffect` |
| `useMemo` | `remember` + `derivedStateOf` |
| `useCallback` | Regular function or `remember` |
| `map()` in JSX | `items()` in `LazyColumn` |
| `onClick` | `Modifier.clickable()` |
| CSS styles | `Modifier` chain |
| `localStorage` | `SharedPreferences` / `DataStore` |

---

## 📊 Chart Library Comparison

### **Vico (Recommended)**
- ✅ Jetpack Compose-first
- ✅ Beautiful, modern design
- ✅ Excellent performance
- ✅ Supports: Bar, Line, Column, Candlestick
- ❌ No Pie, Radar, TreeMap

### **MPAndroidChart**
- ✅ Mature, feature-rich
- ✅ Supports: Pie, Radar, Bubble, Scatter
- ✅ Large community
- ❌ XML-based (requires View interop)
- ❌ Older API design

### **Recommendation**
Use **Vico** for Bar/Line charts + **Canvas** for custom Pie charts, or integrate **MPAndroidChart** via `AndroidView` for complex charts.

---

## 🚀 Next Steps

1. **Implement API Service**: Create `SalesApiService.kt` with Retrofit
2. **Build ViewModel**: Complete `SalesDashboardViewModel.kt` with all KPI calculations
3. **Create Chart Composables**: Finish `SalesCharts.kt` with Vico
4. **Build Main Screen**: Complete `SalesDashboardScreen.kt` with filters
5. **Add Cache Sync**: Implement `CacheSyncManager.kt`
6. **Test & Polish**: Handle edge cases, loading states, errors

---

## 📝 Code Quality Checklist

- [ ] **Error handling**: Try-catch blocks with user-friendly messages
- [ ] **Loading states**: Show progress indicators during operations
- [ ] **Offline support**: Graceful degradation when network unavailable
- [ ] **Memory management**: Cancel coroutines on ViewModel clear
- [ ] **Data validation**: Validate date ranges, filter inputs
- [ ] **Accessibility**: Content descriptions for icons, proper contrast
- [ ] **Performance**: Use `LazyColumn` for lists, avoid unnecessary recompositions
- [ ] **Testing**: Unit tests for ViewModel, Repository, FieldExtractor

---

## 🎯 Key Differences: React vs Android

| Aspect | React (Web) | Android (Native) |
|--------|-------------|------------------|
| **State** | `useState`, `useReducer` | `StateFlow`, `MutableStateFlow` |
| **Effects** | `useEffect` | `LaunchedEffect`, `DisposableEffect` |
| **Memoization** | `useMemo`, `useCallback` | `remember`, `derivedStateOf` |
| **Storage** | `localStorage`, `sessionStorage`, OPFS | `SharedPreferences`, `DataStore`, Room |
| **Network** | `fetch`, Axios | Retrofit, OkHttp |
| **Rendering** | Virtual DOM reconciliation | Compose snapshot system |
| **Lifecycle** | Component mount/unmount | Lifecycle-aware coroutines |

---

## 📚 Resources

- **Jetpack Compose**: https://developer.android.com/jetpack/compose
- **Room Database**: https://developer.android.com/training/data-storage/room
- **Vico Charts**: https://github.com/patrykandpatrick/vico
- **Retrofit**: https://square.github.io/retrofit/
- **Kotlin Coroutines**: https://kotlinlang.org/docs/coroutines-overview.html

---

## ✅ Migration Completion Status

- [x] Data Models
- [x] Field Extractor Utility
- [x] Room Database Setup
- [x] Build Configuration
- [ ] API Service Layer (TODO)
- [ ] ViewModel Implementation (TODO)
- [ ] UI Components (TODO)
- [ ] Chart Integration (TODO)
- [ ] Cache Synchronization (TODO)
- [ ] Testing & Polish (TODO)

---

**Estimated Time to Complete**: 40-60 hours for full feature parity with React dashboard.

**Priority Order**:
1. ViewModel + Repository (foundation)
2. Basic UI with KPI cards
3. Data fetching from cache/API
4. Chart integration (start with Bar/Line)
5. Filters and interactions
6. Cache sync with progress
7. Advanced charts (Pie, Map, TreeMap)
