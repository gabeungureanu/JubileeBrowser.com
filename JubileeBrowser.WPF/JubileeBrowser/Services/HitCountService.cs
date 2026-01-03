using Npgsql;

namespace JubileeBrowser.Services;

/// <summary>
/// Service for tracking platform hit counts/visits.
/// Provides high-level analytics without tracking individual user sessions.
/// </summary>
public class HitCountService
{
    private readonly string _connectionString;
    private bool _isInitialized = false;
    private bool _isAvailable = false;
    private DateTime _lastHitRecorded = DateTime.MinValue;
    private readonly object _lock = new();

    // Minimum interval between hit recordings to prevent duplicate counting
    // from rapid navigation events or page reloads
    private static readonly TimeSpan MinHitInterval = TimeSpan.FromSeconds(5);

    public HitCountService(string? connectionString = null)
    {
        _connectionString = connectionString ??
            "Host=localhost;Port=5432;Database=WorldWideBibleWeb;Username=postgres;Password=postgres";
    }

    /// <summary>
    /// Initializes the service and checks database connectivity.
    /// </summary>
    public async Task InitializeAsync()
    {
        try
        {
            await using var connection = new NpgsqlConnection(_connectionString);
            await connection.OpenAsync();

            // Verify the HitCount_Daily table exists
            const string checkQuery = @"
                SELECT EXISTS (
                    SELECT FROM information_schema.tables
                    WHERE table_name = 'HitCount_Daily'
                )";

            await using var cmd = new NpgsqlCommand(checkQuery, connection);
            var exists = (bool)(await cmd.ExecuteScalarAsync() ?? false);

            if (exists)
            {
                _isAvailable = true;
                _isInitialized = true;
                System.Diagnostics.Debug.WriteLine("HitCountService initialized successfully");
            }
            else
            {
                System.Diagnostics.Debug.WriteLine("HitCountService: HitCount_Daily table not found");
                _isInitialized = true;
                _isAvailable = false;
            }
        }
        catch (Exception ex)
        {
            System.Diagnostics.Debug.WriteLine($"HitCountService initialization failed: {ex.Message}");
            _isInitialized = true;
            _isAvailable = false;
        }
    }

    /// <summary>
    /// Records a platform hit/visit. This should be called when a legitimate
    /// user visit occurs (e.g., navigation to a new page, browser session start).
    ///
    /// The method is idempotent and rate-limited to prevent duplicate counting
    /// from rapid navigation events.
    /// </summary>
    /// <returns>True if the hit was recorded, false if skipped or failed.</returns>
    public async Task<bool> RecordHitAsync()
    {
        if (!_isAvailable) return false;

        // Rate limiting to prevent duplicate counting
        lock (_lock)
        {
            var now = DateTime.UtcNow;
            if (now - _lastHitRecorded < MinHitInterval)
            {
                System.Diagnostics.Debug.WriteLine("HitCountService: Hit skipped (rate limited)");
                return false;
            }
            _lastHitRecorded = now;
        }

        try
        {
            await using var connection = new NpgsqlConnection(_connectionString);
            await connection.OpenAsync();

            // Use the atomic increment function for concurrency safety
            const string query = "SELECT * FROM increment_daily_hitcount(1)";

            await using var cmd = new NpgsqlCommand(query, connection);
            await using var reader = await cmd.ExecuteReaderAsync();

            if (await reader.ReadAsync())
            {
                var date = reader.GetDateTime(0);
                var totalHits = reader.GetInt64(1);
                var wasInserted = reader.GetBoolean(2);

                System.Diagnostics.Debug.WriteLine(
                    $"HitCountService: Hit recorded for {date:yyyy-MM-dd}, total today: {totalHits}" +
                    (wasInserted ? " (new day)" : ""));
                return true;
            }

            return false;
        }
        catch (Exception ex)
        {
            System.Diagnostics.Debug.WriteLine($"HitCountService: Failed to record hit: {ex.Message}");
            return false;
        }
    }

    /// <summary>
    /// Gets a summary of hit counts across various time periods.
    /// </summary>
    public async Task<HitCountSummary?> GetSummaryAsync()
    {
        if (!_isAvailable) return null;

        try
        {
            await using var connection = new NpgsqlConnection(_connectionString);
            await connection.OpenAsync();

            const string query = "SELECT * FROM get_hitcount_summary()";

            await using var cmd = new NpgsqlCommand(query, connection);
            await using var reader = await cmd.ExecuteReaderAsync();

            if (await reader.ReadAsync())
            {
                return new HitCountSummary
                {
                    Today = reader.GetInt64(0),
                    Yesterday = reader.GetInt64(1),
                    ThisWeek = reader.GetInt64(2),
                    LastWeek = reader.GetInt64(3),
                    ThisMonth = reader.GetInt64(4),
                    LastMonth = reader.GetInt64(5),
                    ThisYear = reader.GetInt64(6),
                    AllTime = reader.GetInt64(7)
                };
            }

            return null;
        }
        catch (Exception ex)
        {
            System.Diagnostics.Debug.WriteLine($"HitCountService: Failed to get summary: {ex.Message}");
            return null;
        }
    }

    /// <summary>
    /// Gets daily hit counts for a date range.
    /// </summary>
    public async Task<List<DailyHitCount>> GetRangeAsync(DateTime startDate, DateTime? endDate = null)
    {
        var results = new List<DailyHitCount>();

        if (!_isAvailable) return results;

        try
        {
            await using var connection = new NpgsqlConnection(_connectionString);
            await connection.OpenAsync();

            const string query = "SELECT * FROM get_hitcount_range(@start, @end)";

            await using var cmd = new NpgsqlCommand(query, connection);
            cmd.Parameters.AddWithValue("@start", startDate.Date);
            cmd.Parameters.AddWithValue("@end", endDate?.Date ?? DateTime.Today);

            await using var reader = await cmd.ExecuteReaderAsync();

            while (await reader.ReadAsync())
            {
                results.Add(new DailyHitCount
                {
                    Date = DateOnly.FromDateTime(reader.GetDateTime(0)),
                    TotalHits = reader.GetInt64(1)
                });
            }

            return results;
        }
        catch (Exception ex)
        {
            System.Diagnostics.Debug.WriteLine($"HitCountService: Failed to get range: {ex.Message}");
            return results;
        }
    }

    /// <summary>
    /// Gets monthly hit count aggregations.
    /// </summary>
    public async Task<List<MonthlyHitCount>> GetMonthlyAsync(int? year = null)
    {
        var results = new List<MonthlyHitCount>();

        if (!_isAvailable) return results;

        try
        {
            await using var connection = new NpgsqlConnection(_connectionString);
            await connection.OpenAsync();

            var query = @"SELECT ""Year"", ""Month"", ""MonthStart"", ""TotalHits"", ""DaysWithData""
                          FROM ""HitCount_Monthly""";

            if (year.HasValue)
            {
                query += @" WHERE ""Year"" = @year";
            }

            query += @" ORDER BY ""Year"" DESC, ""Month"" DESC";

            await using var cmd = new NpgsqlCommand(query, connection);

            if (year.HasValue)
            {
                cmd.Parameters.AddWithValue("@year", year.Value);
            }

            await using var reader = await cmd.ExecuteReaderAsync();

            while (await reader.ReadAsync())
            {
                results.Add(new MonthlyHitCount
                {
                    Year = reader.GetInt32(0),
                    Month = reader.GetInt32(1),
                    MonthStart = DateOnly.FromDateTime(reader.GetDateTime(2)),
                    TotalHits = reader.GetInt64(3),
                    DaysWithData = reader.GetInt32(4)
                });
            }

            return results;
        }
        catch (Exception ex)
        {
            System.Diagnostics.Debug.WriteLine($"HitCountService: Failed to get monthly: {ex.Message}");
            return results;
        }
    }

    /// <summary>
    /// Gets yearly hit count aggregations.
    /// </summary>
    public async Task<List<YearlyHitCount>> GetYearlyAsync()
    {
        var results = new List<YearlyHitCount>();

        if (!_isAvailable) return results;

        try
        {
            await using var connection = new NpgsqlConnection(_connectionString);
            await connection.OpenAsync();

            const string query = @"SELECT ""Year"", ""TotalHits"", ""DaysWithData""
                                   FROM ""HitCount_Yearly""
                                   ORDER BY ""Year"" DESC";

            await using var cmd = new NpgsqlCommand(query, connection);
            await using var reader = await cmd.ExecuteReaderAsync();

            while (await reader.ReadAsync())
            {
                results.Add(new YearlyHitCount
                {
                    Year = reader.GetInt32(0),
                    TotalHits = reader.GetInt64(1),
                    DaysWithData = reader.GetInt32(2)
                });
            }

            return results;
        }
        catch (Exception ex)
        {
            System.Diagnostics.Debug.WriteLine($"HitCountService: Failed to get yearly: {ex.Message}");
            return results;
        }
    }

    public bool IsInitialized => _isInitialized;
    public bool IsAvailable => _isAvailable;
}

/// <summary>
/// Summary of hit counts across various time periods.
/// </summary>
public class HitCountSummary
{
    public long Today { get; init; }
    public long Yesterday { get; init; }
    public long ThisWeek { get; init; }
    public long LastWeek { get; init; }
    public long ThisMonth { get; init; }
    public long LastMonth { get; init; }
    public long ThisYear { get; init; }
    public long AllTime { get; init; }
}

/// <summary>
/// Daily hit count record.
/// </summary>
public class DailyHitCount
{
    public DateOnly Date { get; init; }
    public long TotalHits { get; init; }
}

/// <summary>
/// Monthly hit count aggregation.
/// </summary>
public class MonthlyHitCount
{
    public int Year { get; init; }
    public int Month { get; init; }
    public DateOnly MonthStart { get; init; }
    public long TotalHits { get; init; }
    public int DaysWithData { get; init; }
}

/// <summary>
/// Yearly hit count aggregation.
/// </summary>
public class YearlyHitCount
{
    public int Year { get; init; }
    public long TotalHits { get; init; }
    public int DaysWithData { get; init; }
}
