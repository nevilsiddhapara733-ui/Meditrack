using Microsoft.AspNetCore.Mvc;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace MediTrack.Controllers;

[ApiController]
[Route("api/[controller]")]
public class ImageSearchController : ControllerBase
{
    private readonly HttpClient _http;
    private readonly ILogger<ImageSearchController> _logger;

    public ImageSearchController(IHttpClientFactory httpClientFactory,
                                  ILogger<ImageSearchController> logger)
    {
        _http   = httpClientFactory.CreateClient("imagesearch");
        _logger = logger;
    }

    [HttpGet]
    public async Task<IActionResult> Search([FromQuery] string q)
    {
        if (string.IsNullOrWhiteSpace(q))
            return BadRequest(new { error = "Query is required" });

        var results = new List<ImageResult>();

        // Run all sources in parallel
        var tasks = new[]
        {
            FetchOpenDrugFacts(q),
            FetchWikimedia(q),
            FetchOpenVerse(q)
        };

        var allResults = await Task.WhenAll(tasks);
        foreach (var batch in allResults)
            results.AddRange(batch);

        // Deduplicate by URL
        var seen  = new HashSet<string>();
        var final = results
            .Where(r => !string.IsNullOrEmpty(r.Full) && seen.Add(r.Full))
            .ToList();

        return Ok(new { images = final, count = final.Count });
    }

    /* ── Open Drug Facts ─────────────────────────────────────── */
    private async Task<List<ImageResult>> FetchOpenDrugFacts(string q)
    {
        var list = new List<ImageResult>();
        try
        {
            var url = $"https://world.opendrugfacts.org/cgi/search.pl" +
                      $"?search_terms={Uri.EscapeDataString(q)}" +
                      $"&search_simple=1&action=process&json=1&page_size=15";

            var res  = await _http.GetStringAsync(url);
            var data = JsonDocument.Parse(res);

            if (!data.RootElement.TryGetProperty("products", out var products))
                return list;

            foreach (var p in products.EnumerateArray())
            {
                string? imageUrl =
                    GetStr(p, "image_front_url") ??
                    GetStr(p, "image_url");

                if (string.IsNullOrEmpty(imageUrl)) continue;

                string thumb = imageUrl.Replace("/400.", "/200.")
                                       .Replace("/full.", "/200.");

                list.Add(new ImageResult
                {
                    Thumb  = thumb,
                    Full   = imageUrl,
                    Name   = GetStr(p, "product_name") ?? GetStr(p, "generic_name") ?? q,
                    Brand  = GetStr(p, "brands") ?? "",
                    Source = "drugfacts",
                    Label  = "📦 Drug Facts"
                });
            }
        }
        catch (Exception ex) { _logger.LogWarning("DrugFacts error: {e}", ex.Message); }
        return list;
    }

    /* ── Wikimedia Commons ───────────────────────────────────── */
    private async Task<List<ImageResult>> FetchWikimedia(string q)
    {
        var list = new List<ImageResult>();
        try
        {
            var query = Uri.EscapeDataString(q + " medicine tablet pharmaceutical");
            var url   = $"https://commons.wikimedia.org/w/api.php" +
                        $"?action=query&generator=search" +
                        $"&gsrsearch={query}&gsrnamespace=6&gsrlimit=12" +
                        $"&prop=imageinfo&iiprop=url|thumburl|mime" +
                        $"&iiurlwidth=320&format=json&origin=*";

            var res  = await _http.GetStringAsync(url);
            var data = JsonDocument.Parse(res);

            if (!data.RootElement.TryGetProperty("query", out var qEl)) return list;
            if (!qEl.TryGetProperty("pages", out var pages)) return list;

            foreach (var page in pages.EnumerateObject())
            {
                if (!page.Value.TryGetProperty("imageinfo", out var ii)) continue;
                var info = ii[0];
                var mime = GetStr(info, "mime") ?? "";
                if (!mime.Contains("jpeg") && !mime.Contains("png")) continue;

                var thumb = GetStr(info, "thumburl");
                var full  = GetStr(info, "url");
                if (string.IsNullOrEmpty(thumb) || string.IsNullOrEmpty(full)) continue;

                var title = GetStr(page.Value, "title") ?? q;
                title = System.Text.RegularExpressions.Regex
                    .Replace(title.Replace("File:", ""), @"\.[^.]+$", "");

                list.Add(new ImageResult
                {
                    Thumb  = thumb,
                    Full   = full,
                    Name   = title,
                    Brand  = "",
                    Source = "wiki",
                    Label  = "📚 Wikimedia"
                });
            }
        }
        catch (Exception ex) { _logger.LogWarning("Wikimedia error: {e}", ex.Message); }
        return list;
    }

    /* ── Openverse ───────────────────────────────────────────── */
    private async Task<List<ImageResult>> FetchOpenVerse(string q)
    {
        var list = new List<ImageResult>();
        try
        {
            var query = Uri.EscapeDataString(q + " medicine pharmaceutical");
            var url   = $"https://api.openverse.org/v1/images/" +
                        $"?q={query}&page_size=10&license_type=commercial&mature=false";

            var res  = await _http.GetStringAsync(url);
            var data = JsonDocument.Parse(res);

            if (!data.RootElement.TryGetProperty("results", out var results))
                return list;

            foreach (var r in results.EnumerateArray())
            {
                var full  = GetStr(r, "url");
                var thumb = GetStr(r, "thumbnail") ?? full;
                if (string.IsNullOrEmpty(full)) continue;

                list.Add(new ImageResult
                {
                    Thumb  = thumb ?? full,
                    Full   = full,
                    Name   = GetStr(r, "title") ?? q,
                    Brand  = "",
                    Source = "openverse",
                    Label  = "🌐 Openverse"
                });
            }
        }
        catch (Exception ex) { _logger.LogWarning("Openverse error: {e}", ex.Message); }
        return list;
    }

    private static string? GetStr(JsonElement el, string key)
    {
        try
        {
            return el.TryGetProperty(key, out var v) &&
                   v.ValueKind == JsonValueKind.String
                ? v.GetString() : null;
        }
        catch { return null; }
    }
}

public class ImageResult
{
    [JsonPropertyName("thumb")]  public string Thumb  { get; set; } = "";
    [JsonPropertyName("full")]   public string Full   { get; set; } = "";
    [JsonPropertyName("name")]   public string Name   { get; set; } = "";
    [JsonPropertyName("brand")]  public string Brand  { get; set; } = "";
    [JsonPropertyName("source")] public string Source { get; set; } = "";
    [JsonPropertyName("label")]  public string Label  { get; set; } = "";
}
