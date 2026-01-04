namespace JubileeBrowser.Shared.Models;

/// <summary>
/// Represents a DNS record in the WorldWideBibleWeb system.
/// </summary>
public class DnsRecord
{
    public int DnsId { get; set; }
    public int TypeId { get; set; }
    public string DomainName { get; set; } = string.Empty;
    public string PrivateProtocolUrl { get; set; } = string.Empty;
    public string PublicRelativePath { get; set; } = string.Empty;
    public string PublicUrl { get; set; } = string.Empty;
    public string? ThirdPartyOverrideUrl { get; set; }
    public bool IsActive { get; set; } = true;
    public int Priority { get; set; } = 100;
    public string? Description { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }

    // Navigation property
    public string? WebSpaceTypeName { get; set; }
}

/// <summary>
/// Represents a web space type definition.
/// </summary>
public class WebSpaceType
{
    public int TypeId { get; set; }
    public string FullTypeName { get; set; } = string.Empty;
    public string? AbbreviatedName { get; set; }
    public string? Description { get; set; }
    public bool IsActive { get; set; } = true;
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }
}

/// <summary>
/// Result of a DNS resolution request.
/// </summary>
public class DnsResolutionResult
{
    public bool Success { get; set; }
    public string? ResolvedUrl { get; set; }
    public string? PrivateUrl { get; set; }
    public string? WebSpaceType { get; set; }
    public string? DomainName { get; set; }
    public bool FromCache { get; set; }
    public string? ErrorMessage { get; set; }
}
