using System;
using System.IO;
using System.Collections.Generic;
using YamlDotNet.Serialization;

public class BlacklistData
{
    public List<string>? Domains { get; set; }
    [YamlMember(Alias = "blocked_sites")]
    public List<string>? BlockedSites { get; set; }
}

class Program
{
    static void Main()
    {
        var yaml = File.ReadAllText("../blacklist.yaml");
        var deserializer = new DeserializerBuilder()
            .IgnoreUnmatchedProperties()
            .Build();
        var blocklist = deserializer.Deserialize<BlacklistData>(yaml);
        
        Console.WriteLine($"Domains: {blocklist?.Domains?.Count ?? 0}");
        Console.WriteLine($"BlockedSites: {blocklist?.BlockedSites?.Count ?? 0}");
        
        if (blocklist?.BlockedSites?.Count > 0)
        {
            Console.WriteLine($"First 5 sites:");
            foreach (var site in blocklist.BlockedSites.Take(5))
                Console.WriteLine($"  - {site}");
        }
    }
}
