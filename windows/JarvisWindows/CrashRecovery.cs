using System;
using System.Threading;
using System.Threading.Tasks;

namespace JarvisWindows;

public class CrashRecovery
{
    private readonly ErrorLogger _logger;
    private readonly CancellationTokenSource _cts = new();
    private int _restartCount = 0;
    private const int MaxRestarts = 5;
    private const int RestartDelayMs = 5000;

    public event Action<string>? OnRecoveryAttempt;
    public event Action<string>? OnRecoveryFailed;

    public CrashRecovery(ErrorLogger logger)
    {
        _logger = logger;
    }

    public async Task<T> RecoverWithRetryAsync<T>(
        string serviceName,
        Func<Task<T>> operation,
        int maxRetries = 3,
        int delayMs = 1000)
    {
        int attempt = 0;
        Exception? lastException = null;

        while (attempt < maxRetries)
        {
            try
            {
                attempt++;
                var result = await operation();
                if (attempt > 1)
                {
                    _logger.LogInfo(serviceName, $"Service recovered after {attempt} attempts");
                    OnRecoveryAttempt?.Invoke($"{serviceName} recovered successfully");
                }
                return result;
            }
            catch (Exception ex)
            {
                lastException = ex;
                _logger.LogError(serviceName, $"Attempt {attempt} failed", ex);

                if (attempt < maxRetries)
                {
                    await Task.Delay(delayMs);
                }
            }
        }

        _logger.LogError(serviceName, $"All {maxRetries} recovery attempts failed", lastException);
        OnRecoveryFailed?.Invoke($"{serviceName} recovery failed after {maxRetries} attempts");
        throw new InvalidOperationException($"Service {serviceName} failed to recover after {maxRetries} attempts", lastException);
    }

    public async Task RecoverServiceAsync(
        string serviceName,
        Action startAction,
        Action? stopAction = null)
    {
        if (_restartCount >= MaxRestarts)
        {
            _logger.LogError(serviceName, "Max restart limit reached, stopping recovery attempts");
            OnRecoveryFailed?.Invoke($"{serviceName} max restart limit reached");
            return;
        }

        _restartCount++;
        OnRecoveryAttempt?.Invoke($"Attempting to restart {serviceName} (attempt {_restartCount}/{MaxRestarts})");
        _logger.LogInfo(serviceName, $"Restart attempt {_restartCount}/{MaxRestarts}");

        try
        {
            stopAction?.Invoke();
            await Task.Delay(RestartDelayMs);
            startAction();
            _logger.LogInfo(serviceName, "Service restarted successfully");
        }
        catch (Exception ex)
        {
            _logger.LogError(serviceName, "Restart failed", ex);
            OnRecoveryFailed?.Invoke($"{serviceName} restart failed");
        }
    }

    public void ResetRestartCount()
    {
        _restartCount = 0;
    }

    public void Stop()
    {
        _cts.Cancel();
    }
}
