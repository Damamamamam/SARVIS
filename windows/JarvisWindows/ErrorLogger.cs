using System;
using System.IO;
using System.Text;

namespace JarvisWindows;

public class ErrorLogger : IDisposable
{
    private readonly string _logFilePath;
    private readonly object _lock = new();
    private readonly StringBuilder _recentErrors = new();
    private const int MaxRecentErrors = 50;

    public event Action<string>? OnErrorLogged;

    public ErrorLogger()
    {
        var logDir = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
            "SARVIS",
            "Logs"
        );
        Directory.CreateDirectory(logDir);

        var timestamp = DateTime.Now.ToString("yyyyMMdd");
        _logFilePath = Path.Combine(logDir, $"sarvis_{timestamp}.log");
    }

    public void LogError(string source, string message, Exception? exception = null)
    {
        var logEntry = BuildLogEntry(source, message, exception);

        lock (_lock)
        {
            File.AppendAllText(_logFilePath, logEntry + Environment.NewLine);

            _recentErrors.AppendLine(logEntry);
            if (_recentErrors.Length > 10000)
            {
                var lines = _recentErrors.ToString().Split('\n');
                _recentErrors.Clear();
                var start = Math.Max(0, lines.Length - MaxRecentErrors);
                for (int i = start; i < lines.Length; i++)
                {
                    _recentErrors.AppendLine(lines[i]);
                }
            }
        }

        OnErrorLogged?.Invoke(logEntry);
    }

    public void LogWarning(string source, string message)
    {
        var logEntry = $"[{DateTime.Now:yyyy-MM-dd HH:mm:ss}] [WARNING] [{source}] {message}";

        lock (_lock)
        {
            File.AppendAllText(_logFilePath, logEntry + Environment.NewLine);
        }

        OnErrorLogged?.Invoke(logEntry);
    }

    public void LogInfo(string source, string message)
    {
        var logEntry = $"[{DateTime.Now:yyyy-MM-dd HH:mm:ss}] [INFO] [{source}] {message}";

        lock (_lock)
        {
            File.AppendAllText(_logFilePath, logEntry + Environment.NewLine);
        }
    }

    private string BuildLogEntry(string source, string message, Exception? exception)
    {
        var sb = new StringBuilder();
        sb.AppendLine($"[{DateTime.Now:yyyy-MM-dd HH:mm:ss}] [ERROR] [{source}] {message}");

        if (exception != null)
        {
            sb.AppendLine($"  Exception: {exception.GetType().Name} - {exception.Message}");
            sb.AppendLine($"  Stack Trace: {exception.StackTrace}");

            if (exception.InnerException != null)
            {
                sb.AppendLine($"  Inner Exception: {exception.InnerException.Message}");
                sb.AppendLine($"  Inner Stack Trace: {exception.InnerException.StackTrace}");
            }
        }

        return sb.ToString();
    }

    public string GetRecentErrors()
    {
        lock (_lock)
        {
            return _recentErrors.ToString();
        }
    }

    public string GetLogFilePath() => _logFilePath;

    public void ClearRecentErrors()
    {
        lock (_lock)
        {
            _recentErrors.Clear();
        }
    }

    public void Dispose()
    {
        lock (_lock)
        {
            if (File.Exists(_logFilePath))
            {
                var logDir = Path.GetDirectoryName(_logFilePath);
                if (logDir != null)
                {
                    var files = Directory.GetFiles(logDir, "sarvis_*.log");
                    foreach (var file in files)
                    {
                        var fileInfo = new FileInfo(file);
                        if (fileInfo.LastWriteTime < DateTime.Now.AddDays(-7))
                        {
                            try
                            {
                                File.Delete(file);
                            }
                            catch { }
                        }
                    }
                }
            }
        }
    }
}
