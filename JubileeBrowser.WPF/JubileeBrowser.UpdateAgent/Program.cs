using JubileeBrowser.UpdateAgent;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;

var options = UpdateAgentOptions.Load();

var runOnce = args.Any(arg => arg.Equals("--run-once", StringComparison.OrdinalIgnoreCase));
var applyOnly = args.Any(arg => arg.Equals("--apply-pending", StringComparison.OrdinalIgnoreCase));

if (runOnce || applyOnly)
{
    var logger = new UpdateLogger(options);
    var agent = new UpdateAgentCore(options, logger);
    await agent.RunOnceAsync(applyOnly, CancellationToken.None);
    return;
}

var host = Host.CreateDefaultBuilder(args)
    .UseWindowsService()
    .ConfigureServices(services =>
    {
        services.AddSingleton(options);
        services.AddSingleton<UpdateLogger>();
        services.AddSingleton<UpdateAgentCore>();
        services.AddHostedService<UpdateAgentWorker>();
    })
    .Build();

await host.RunAsync();
