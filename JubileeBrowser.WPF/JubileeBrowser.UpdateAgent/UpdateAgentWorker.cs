using Microsoft.Extensions.Hosting;

namespace JubileeBrowser.UpdateAgent;

public class UpdateAgentWorker : BackgroundService
{
    private readonly UpdateAgentCore _agent;
    private readonly UpdateAgentOptions _options;

    public UpdateAgentWorker(UpdateAgentCore agent, UpdateAgentOptions options)
    {
        _agent = agent;
        _options = options;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        if (_options.InitialDelaySeconds > 0)
        {
            try
            {
                await Task.Delay(TimeSpan.FromSeconds(_options.InitialDelaySeconds), stoppingToken);
            }
            catch (TaskCanceledException)
            {
                return;
            }
        }

        var updateLoop = RunUpdateLoopAsync(stoppingToken);
        var applyLoop = RunApplyLoopAsync(stoppingToken);

        await Task.WhenAll(updateLoop, applyLoop);
    }

    private async Task RunUpdateLoopAsync(CancellationToken stoppingToken)
    {
        var interval = TimeSpan.FromHours(Math.Max(1, _options.CheckIntervalHours));
        using var timer = new PeriodicTimer(interval);

        while (!stoppingToken.IsCancellationRequested)
        {
            await _agent.CheckAndStageUpdateAsync(stoppingToken);

            try
            {
                await timer.WaitForNextTickAsync(stoppingToken);
            }
            catch (OperationCanceledException)
            {
                break;
            }
        }
    }

    private async Task RunApplyLoopAsync(CancellationToken stoppingToken)
    {
        var interval = TimeSpan.FromMinutes(Math.Max(1, _options.ApplyCheckIntervalMinutes));
        using var timer = new PeriodicTimer(interval);

        while (!stoppingToken.IsCancellationRequested)
        {
            await _agent.TryApplyPendingUpdateAsync(stoppingToken);

            try
            {
                await timer.WaitForNextTickAsync(stoppingToken);
            }
            catch (OperationCanceledException)
            {
                break;
            }
        }
    }
}
