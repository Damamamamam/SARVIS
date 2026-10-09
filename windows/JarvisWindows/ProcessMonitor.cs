using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Text;
using System.Timers;

namespace JarvisWindows;

public class ProcessMonitor : IDisposable
{
    [DllImport("user32.dll")]
    private static extern IntPtr GetForegroundWindow();

    [DllImport("user32.dll", SetLastError = true)]
    private static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint lpdwProcessId);

    [DllImport("user32.dll", SetLastError = true, CharSet = CharSet.Auto)]
    private static extern int GetWindowText(IntPtr hWnd, StringBuilder lpString, int nMaxCount);

    private readonly System.Timers.Timer _timer;
    private readonly ConcurrentDictionary<string, TimeSpan> _appUsage = new(StringComparer.OrdinalIgnoreCase);
    private readonly HashSet<string> _flaggedApps = new(StringComparer.OrdinalIgnoreCase)
    {
        "chrome", "msedge", "firefox", "opera", "brave",
        "discord", "steam", "spotify", "telegram", "whatsapp",
        "tiktok", "instagram", "twitter", "reddit"
    };

    private string _currentApp = string.Empty;
    private string _currentTitle = string.Empty;
    private DateTime _lastCheckTime = DateTime.UtcNow;
    private TimeSpan _doomscrollThreshold = TimeSpan.FromMinutes(25);
    private readonly HashSet<string> _notifiedDoomscrollApps = new(StringComparer.OrdinalIgnoreCase);

    public event Action<string, string>? OnForegroundAppChanged;
    public event Action<string, TimeSpan>? OnDoomscrollDetected;
    public event Action<string, string, long>? OnScreenTimeRecorded;

    public TimeSpan DoomscrollThreshold
    {
        get => _doomscrollThreshold;
        set => _doomscrollThreshold = value;
    }

    public ProcessMonitor(double checkIntervalMs = 5000)
    {
        _timer = new System.Timers.Timer(checkIntervalMs);
        _timer.Elapsed += OnTimerElapsed;
        _timer.AutoReset = true;
    }

    public void Start()
    {
        _lastCheckTime = DateTime.UtcNow;
        _timer.Start();
    }

    public void Stop()
    {
        _timer.Stop();
    }

    private void OnTimerElapsed(object? sender, ElapsedEventArgs e)
    {
        try
        {
            var now = DateTime.UtcNow;
            var delta = now - _lastCheckTime;
            _lastCheckTime = now;

            var (appName, title) = GetActiveProcessInfo();
            if (string.IsNullOrEmpty(appName)) return;

            bool appChanged = !appName.Equals(_currentApp, StringComparison.OrdinalIgnoreCase);
            _currentApp = appName;
            _currentTitle = title;

            if (appChanged)
            {
                OnForegroundAppChanged?.Invoke(appName, title);
            }

            // Accumulate duration
            var updatedDuration = _appUsage.AddOrUpdate(appName, delta, (key, oldVal) => oldVal + delta);

            // Report screen time to brain
            OnScreenTimeRecorded?.Invoke(appName, title, (long)delta.TotalMilliseconds);

            // Check doomscroll condition for flagged apps
            if (_flaggedApps.Contains(appName))
            {
                if (updatedDuration >= _doomscrollThreshold && !_notifiedDoomscrollApps.Contains(appName))
                {
                    _notifiedDoomscrollApps.Add(appName);
                    OnDoomscrollDetected?.Invoke(appName, updatedDuration);
                }
            }
        }
        catch (Exception ex)
        {
            Console.WriteLine($"Process monitor tick failed: {ex.Message}");
        }
    }

    public (string AppName, string Title) GetActiveProcessInfo()
    {
        var hWnd = GetForegroundWindow();
        if (hWnd == IntPtr.Zero) return (string.Empty, string.Empty);

        GetWindowThreadProcessId(hWnd, out uint pid);
        if (pid == 0) return (string.Empty, string.Empty);

        string appName = string.Empty;
        try
        {
            using var proc = Process.GetProcessById((int)pid);
            appName = proc.ProcessName;
        }
        catch
        {
            appName = "unknown";
        }

        var sb = new StringBuilder(256);
        GetWindowText(hWnd, sb, sb.Capacity);
        string title = sb.ToString();

        return (appName, title);
    }

    public IReadOnlyDictionary<string, TimeSpan> GetUsageSnapshot()
    {
        return new Dictionary<string, TimeSpan>(_appUsage);
    }

    public void ResetDailyUsage()
    {
        _appUsage.Clear();
        _notifiedDoomscrollApps.Clear();
    }

    public void Dispose()
    {
        Stop();
        _timer.Dispose();
    }
}
