using System;
using System.Collections.Generic;
using System.Drawing;
using System.Threading.Tasks;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Input;
using System.Windows.Media;
using System.Windows.Shapes;
using System.Windows.Threading;

namespace JarvisWindows;

public partial class MainWindow : Window
{
    private BrainClient? _brainClient;
    private AudioCapture? _audioCapture;
    private VoiceServices? _voiceServices;
    private WindowAutomation? _windowAutomation;
    private ProcessMonitor? _processMonitor;
    private CameraVisionService? _cameraVision;
    private System.Windows.Forms.NotifyIcon? _notifyIcon;
    private ErrorLogger? _errorLogger;
    private CrashRecovery? _crashRecovery;

    private bool _isConnected = false;
    private readonly DispatcherTimer _notificationTimer = new();
    private readonly Queue<double> _audioWaveform = new();
    private const int MaxWaveformSamples = 100;

    public MainWindow()
    {
        InitializeComponent();
        _errorLogger = new ErrorLogger();
        _crashRecovery = new CrashRecovery(_errorLogger);
        InitializeComponents();
        InitializeSystemTray();
        InitializeNotificationTimer();
        InitializeErrorHandling();
        InitializeCrashRecovery();
    }

    private void InitializeComponents()
    {
        var brainUrl = SecureStorage.LoadSecureValue("BRAIN_WS_URL") ?? "ws://localhost:9741";
        _brainClient = new BrainClient(brainUrl);
        _audioCapture = new AudioCapture();
        _voiceServices = new VoiceServices("en-US");
        _windowAutomation = new WindowAutomation();
        _processMonitor = new ProcessMonitor(5000);
        _processMonitor.DoomscrollThreshold = TimeSpan.FromMinutes(LoadIntSetting("DOOMSCROLL_MINUTES", 25, 1, 240));
        _cameraVision = new CameraVisionService(5); // 5 fps landmark tracking

        // Wire Brain Client Events
        _brainClient.OnConnectionChanged += OnBrainConnectionChanged;
        _brainClient.OnMessage += OnBrainMessage;
        _brainClient.OnError += (err) =>
        {
            _errorLogger?.LogError("BrainClient", err);
            Dispatcher.Invoke(() => AddLog($"[Brain Error] {err}"));
        };

        // Wire Audio Capture Events
        _audioCapture.OnAudioData += OnAudioData;
        _audioCapture.OnAudioLevel += (level) =>
        {
            Dispatcher.Invoke(() =>
            {
                AudioLevelBar.Value = Math.Clamp(level * 100f, 0, 100);
                UpdateWaveform(level);
            });
        };
        _audioCapture.OnError += (err) =>
        {
            _errorLogger?.LogError("AudioCapture", err);
            Dispatcher.Invoke(() => AddLog($"[Audio Error] {err}"));
        };

        // Wire Voice Services Events
        _voiceServices.OnSpeakingStarted += OnSpeakingStarted;
        _voiceServices.OnSpeakingCompleted += OnSpeakingCompleted;
        _voiceServices.OnSpeechRecognized += OnSpeechRecognized;
        _voiceServices.OnError += (err) =>
        {
            _errorLogger?.LogError("VoiceServices", err);
            Dispatcher.Invoke(() => AddLog($"[Voice Error] {err}"));
        };

        // Wire Process Monitor Events
        _processMonitor.OnForegroundAppChanged += (app, title) =>
        {
            Dispatcher.Invoke(() =>
            {
                ActiveAppStatus.Text = string.IsNullOrEmpty(title) ? app : $"{app} - {title}";
            });
        };
        _processMonitor.OnDoomscrollDetected += (app, duration) =>
        {
            Dispatcher.Invoke(() =>
            {
                ShowNotification($"⚠️ Doomscroll Alert: You've been on {app} for {duration.TotalMinutes:F0} mins!");
                AddLog($"[Screen Guard] Doomscroll alert triggered for {app} ({duration.TotalMinutes:F0}m)");
                _voiceServices?.Speak($"Notice: You have been using {app} for over {duration.TotalMinutes:F0} minutes.");
            });
        };
        _processMonitor.OnScreenTimeRecorded += (pkg, label, durationMs) =>
        {
            // Send screen time telemetry to brain
            _brainClient?.Send(new
            {
                type = "event",
                module = "screen",
                payload = new
                {
                    pkg,
                    label,
                    durationMs
                }
            });
        };

        // Wire Camera Vision Events
        _cameraVision.OnLandmarksTracked += (landmarks) =>
        {
            _brainClient?.Send(new
            {
                type = "event",
                module = "vision",
                payload = new
                {
                    landmarks = new
                    {
                        upperLip = new { x = landmarks.UpperLip.X, y = landmarks.UpperLip.Y },
                        lowerLip = new { x = landmarks.LowerLip.X, y = landmarks.LowerLip.Y },
                        mouthLeft = new { x = landmarks.MouthLeft.X, y = landmarks.MouthLeft.Y },
                        mouthRight = new { x = landmarks.MouthRight.X, y = landmarks.MouthRight.Y },
                        noseTip = new { x = landmarks.NoseTip.X, y = landmarks.NoseTip.Y },
                        yawDeg = landmarks.YawDeg
                    }
                }
            });
        };
        _cameraVision.OnLog += (log) =>
        {
            _errorLogger?.LogInfo("CameraVision", log);
            Dispatcher.Invoke(() => AddLog($"[Camera] {log}"));
        };

        // Connect to Brain
        AddLog("Connecting to SARVIS brain...");
        Task.Run(async () =>
        {
            await Task.Delay(1500);
            await _brainClient.ConnectAsync();
        });

        // Start subsystems
        _audioCapture.StartRecording();
        UpdateAudioStatus(true);

        var speechLanguage = SecureStorage.LoadSecureValue("SPEECH_LANGUAGE") ?? "en-US";
        _voiceServices.SetLanguage(speechLanguage);

        var enableStt = LoadBoolSetting("ENABLE_CONTINUOUS_STT", true);
        if (enableStt)
        {
            _voiceServices.StartListening();
        }
        UpdateSpeechStatus(enableStt);

        var enableScreenGuard = LoadBoolSetting("ENABLE_SCREEN_GUARD", true);
        if (enableScreenGuard)
        {
            _processMonitor.Start();
        }

        var enableCamera = LoadBoolSetting("ENABLE_CAMERA_TRACKING", true);
        if (enableCamera)
        {
            _cameraVision.StartCapture();
        }
        UpdateVisionStatus(enableCamera);
    }

    private void InitializeSystemTray()
    {
        try
        {
            _notifyIcon = new System.Windows.Forms.NotifyIcon
            {
                Text = "SARVIS Windows Assistant",
                Icon = SystemIcons.Application,
                Visible = true
            };

            var contextMenu = new System.Windows.Forms.ContextMenuStrip();
            contextMenu.Items.Add("Open SARVIS", null, (s, e) => RestoreFromTray());
            contextMenu.Items.Add("Reconnect", null, (s, e) => ReconnectButton_Click(this, new RoutedEventArgs()));
            contextMenu.Items.Add("Settings", null, (s, e) => SettingsButton_Click(this, new RoutedEventArgs()));
            contextMenu.Items.Add("-");
            contextMenu.Items.Add("Exit", null, (s, e) =>
            {
                _notifyIcon.Visible = false;
                Close();
            });

            _notifyIcon.ContextMenuStrip = contextMenu;
            _notifyIcon.DoubleClick += (s, e) => RestoreFromTray();
        }
        catch (Exception ex)
        {
            AddLog($"System tray initialization note: {ex.Message}");
        }
    }

    private void RestoreFromTray()
    {
        Show();
        WindowState = WindowState.Normal;
        Activate();
    }

    protected override void OnStateChanged(EventArgs e)
    {
        if (WindowState == WindowState.Minimized)
        {
            Hide();
            _notifyIcon?.ShowBalloonTip(1500, "SARVIS Active", "SARVIS is running in background.", System.Windows.Forms.ToolTipIcon.Info);
        }
        base.OnStateChanged(e);
    }

    private void InitializeNotificationTimer()
    {
        _notificationTimer.Interval = TimeSpan.FromSeconds(8);
        _notificationTimer.Tick += (s, e) =>
        {
            NotificationBanner.Visibility = Visibility.Collapsed;
            _notificationTimer.Stop();
        };
    }

    private void InitializeErrorHandling()
    {
        if (_errorLogger != null)
        {
            _errorLogger.OnErrorLogged += (error) =>
            {
                Dispatcher.Invoke(() =>
                {
                    AddLog($"[Error Logged] {error}");
                });
            };

            AppDomain.CurrentDomain.UnhandledException += (sender, e) =>
            {
                if (e.ExceptionObject is Exception ex)
                {
                    _errorLogger?.LogError("AppDomain", "Unhandled exception", ex);
                }
            };

            Dispatcher.UnhandledException += (sender, e) =>
            {
                _errorLogger?.LogError("Dispatcher", "Unhandled dispatcher exception", e.Exception);
                e.Handled = true;
            };
        }
    }

    private void InitializeCrashRecovery()
    {
        if (_crashRecovery != null)
        {
            _crashRecovery.OnRecoveryAttempt += (message) =>
            {
                Dispatcher.Invoke(() =>
                {
                    ShowNotification($"🔄 {message}");
                    AddLog($"[Recovery] {message}");
                });
            };

            _crashRecovery.OnRecoveryFailed += (message) =>
            {
                Dispatcher.Invoke(() =>
                {
                    ShowNotification($"⚠️ {message}");
                    AddLog($"[Recovery Failed] {message}");
                });
            };
        }
    }

    private void UpdateWaveform(double level)
    {
        _audioWaveform.Enqueue(level);
        if (_audioWaveform.Count > MaxWaveformSamples)
        {
            _audioWaveform.Dequeue();
        }
        DrawWaveform();
    }

    private void DrawWaveform()
    {
        var canvas = WaveformCanvas;
        var width = canvas.ActualWidth;
        var height = canvas.ActualHeight;

        if (width <= 0 || height <= 0) return;

        canvas.Children.Clear();

        var samples = _audioWaveform.ToArray();
        if (samples.Length == 0) return;

        var barWidth = width / MaxWaveformSamples;
        var centerY = height / 2;

        for (int i = 0; i < samples.Length; i++)
        {
            var sample = samples[i];
            var barHeight = sample * height * 0.8;
            var x = i * barWidth;

            var rect = new System.Windows.Shapes.Rectangle
            {
                Width = barWidth - 1,
                Height = barHeight,
                Fill = new SolidColorBrush(System.Windows.Media.Color.FromRgb(0, 255, 204))
            };

            Canvas.SetLeft(rect, x);
            Canvas.SetTop(rect, centerY - barHeight / 2);
            canvas.Children.Add(rect);
        }
    }

    public void ShowNotification(string message)
    {
        NotificationText.Text = message;
        NotificationBanner.Visibility = Visibility.Visible;
        _notificationTimer.Stop();
        _notificationTimer.Start();
    }

    private void DismissNotification_Click(object sender, RoutedEventArgs e)
    {
        NotificationBanner.Visibility = Visibility.Collapsed;
        _notificationTimer.Stop();
    }

    private void OnBrainConnectionChanged(bool connected)
    {
        Dispatcher.Invoke(() =>
        {
            if (connected)
            {
                ConnectionIndicator.Fill = new SolidColorBrush(System.Windows.Media.Colors.LimeGreen);
                ConnectionStatus.Text = "Connected";
                AddLog("✓ Connected to SARVIS brain");
                ShowNotification("✓ Connected to SARVIS brain");
            }
            else
            {
                ConnectionIndicator.Fill = new SolidColorBrush(System.Windows.Media.Colors.Red);
                ConnectionStatus.Text = "Disconnected";
                if (_isConnected)
                {
                    AddLog("✗ Disconnected from brain");
                    ShowNotification("✗ Disconnected from brain (retrying...)");
                }
            }
            _isConnected = connected;
        });
    }

    private void OnBrainMessage(string message)
    {
        Dispatcher.Invoke(() =>
        {
            try
            {
                var json = Newtonsoft.Json.Linq.JObject.Parse(message);
                var module = json["module"]?.ToString();
                var payload = json["payload"];

                if (module == "voice" && payload != null)
                {
                    var action = payload["action"]?.ToString();
                    if (action == "speak")
                    {
                        var text = payload["text"]?.ToString();
                        if (!string.IsNullOrEmpty(text))
                        {
                            AddLog($"Brain: {text}");
                            _voiceServices?.Speak(text);
                        }
                    }
                }
                else if (module == "device" && payload != null)
                {
                    ProcessDeviceCommand(payload);
                }
            }
            catch (Exception ex)
            {
                _errorLogger?.LogError("MainWindow", "Error parsing brain message", ex);
                AddLog($"Error parsing brain message: {ex.Message}");
            }
        });
    }

    private void OnAudioData(byte[] buffer, int offset, int length)
    {
        var base64Audio = Convert.ToBase64String(buffer, offset, length);
        var message = new
        {
            type = "event",
            module = "audio",
            payload = new
            {
                chunk = base64Audio,
                pcm = base64Audio,
                sampleRate = 16000,
                channels = 1
            }
        };
        _brainClient?.Send(message);
    }

    private void OnSpeechRecognized(string text)
    {
        Dispatcher.Invoke(() =>
        {
            AddLog($"[Speech Recognized] {text}");

            // Check quick local commands
            var lower = text.ToLowerInvariant().Trim();
            if (lower == "minimize")
            {
                var hwnd = _windowAutomation?.GetActiveWindow();
                if (hwnd.HasValue) _windowAutomation?.MinimizeWindow(hwnd.Value);
                return;
            }
            if (lower == "maximize")
            {
                var hwnd = _windowAutomation?.GetActiveWindow();
                if (hwnd.HasValue) _windowAutomation?.MaximizeWindow(hwnd.Value);
                return;
            }
            if (lower == "reconnect")
            {
                _ = _brainClient?.ReconnectAsync();
                return;
            }

            // Send speech transcript to brain
            SendToBrain(text);
        });
    }

    private void OnSpeakingStarted(string text)
    {
        Dispatcher.Invoke(() =>
        {
            UpdateTTSStatus("Speaking");
            _audioCapture?.StopRecording();
            UpdateAudioStatus(false);
        });
    }

    private void OnSpeakingCompleted()
    {
        Dispatcher.Invoke(() =>
        {
            UpdateTTSStatus("Ready");
            _audioCapture?.StartRecording();
            UpdateAudioStatus(true);
        });
    }

    private void ProcessDeviceCommand(Newtonsoft.Json.Linq.JToken payload)
    {
        try
        {
            var action = payload["action"]?.ToString();
            switch (action)
            {
                case "minimize":
                {
                    var hWnd = _windowAutomation?.GetActiveWindow();
                    if (hWnd.HasValue && hWnd.Value != IntPtr.Zero)
                    {
                        _windowAutomation?.MinimizeWindow(hWnd.Value);
                        AddLog("Window minimized");
                    }
                    break;
                }
                case "maximize":
                {
                    var hWnd = _windowAutomation?.GetActiveWindow();
                    if (hWnd.HasValue && hWnd.Value != IntPtr.Zero)
                    {
                        _windowAutomation?.MaximizeWindow(hWnd.Value);
                        AddLog("Window maximized");
                    }
                    break;
                }
                case "restore":
                {
                    var hWnd = _windowAutomation?.GetActiveWindow();
                    if (hWnd.HasValue && hWnd.Value != IntPtr.Zero)
                    {
                        _windowAutomation?.RestoreWindow(hWnd.Value);
                        AddLog("Window restored");
                    }
                    break;
                }
                case "type":
                case "inputText":
                {
                    var text = payload["text"]?.ToString();
                    var hWnd = _windowAutomation?.GetActiveWindow();
                    if (!string.IsNullOrEmpty(text) && hWnd.HasValue && hWnd.Value != IntPtr.Zero)
                    {
                        _windowAutomation?.SendText(hWnd.Value, text);
                        AddLog($"Typed: {text}");
                    }
                    break;
                }
                case "launchApp":
                {
                    var pkg = payload["pkg"]?.ToString() ?? payload["target"]?.ToString();
                    if (!string.IsNullOrEmpty(pkg))
                    {
                        _windowAutomation?.LaunchApp(pkg);
                        AddLog($"Launched application: {pkg}");
                    }
                    break;
                }
                case "closeApp":
                {
                    var pkg = payload["pkg"]?.ToString() ?? payload["target"]?.ToString();
                    if (!string.IsNullOrEmpty(pkg))
                    {
                        _windowAutomation?.CloseApp(pkg);
                        AddLog($"Closed application: {pkg}");
                    }
                    break;
                }
                case "mouseClick":
                {
                    _windowAutomation?.MouseLeftClick();
                    AddLog("Mouse clicked");
                    break;
                }
                case "mouseMove":
                {
                    int x = payload["x"]?.ToObject<int>() ?? 0;
                    int y = payload["y"]?.ToObject<int>() ?? 0;
                    _windowAutomation?.MoveMouse(x, y);
                    break;
                }
                case "setVolume":
                case "volumeUp":
                {
                    _windowAutomation?.VolumeUp(2);
                    AddLog("Volume increased");
                    break;
                }
                case "volumeDown":
                {
                    _windowAutomation?.VolumeDown(2);
                    AddLog("Volume decreased");
                    break;
                }
                case "volumeMute":
                {
                    _windowAutomation?.VolumeMute();
                    AddLog("Volume muted/unmuted");
                    break;
                }
                case "lockScreen":
                {
                    _windowAutomation?.LockScreen();
                    AddLog("Screen locked");
                    break;
                }
            }
        }
        catch (Exception ex)
        {
            AddLog($"Failed to process device command: {ex.Message}");
        }
    }

    private void SendButton_Click(object sender, RoutedEventArgs e)
    {
        var text = InputTextBox.Text.Trim();
        if (!string.IsNullOrEmpty(text))
        {
            AddLog($"You: {text}");
            SendToBrain(text);
            InputTextBox.Clear();
        }
    }

    private void InputTextBox_KeyDown(object sender, KeyEventArgs e)
    {
        if (e.Key == Key.Enter)
        {
            SendButton_Click(sender, e);
        }
    }

    private void SendToBrain(string text)
    {
        var message = new
        {
            type = "event",
            module = "audio",
            payload = new
            {
                transcript = text
            }
        };
        _brainClient?.Send(message);
    }

    private void ReconnectButton_Click(object sender, RoutedEventArgs e)
    {
        AddLog("Reconnecting to brain...");
        _ = _brainClient?.ReconnectAsync();
    }

    private void SettingsButton_Click(object sender, RoutedEventArgs e)
    {
        var settingsWin = new SettingsWindow { Owner = this };
        if (settingsWin.ShowDialog() == true)
        {
            AddLog("Settings updated successfully");
            _brainClient?.UpdateUrl(settingsWin.BrainUrl);
            _ = _brainClient?.ReconnectAsync();

            if (settingsWin.EnableCameraTracking)
                _cameraVision?.StartCapture();
            else
                _cameraVision?.StopCapture();
            UpdateVisionStatus(settingsWin.EnableCameraTracking);

            if (settingsWin.EnableContinuousStt)
                _voiceServices?.StartListening();
            else
                _voiceServices?.StopListening();
            UpdateSpeechStatus(settingsWin.EnableContinuousStt);

            _voiceServices?.SetLanguage(settingsWin.SelectedLanguage);
            if (_processMonitor != null)
            {
                _processMonitor.DoomscrollThreshold = TimeSpan.FromMinutes(settingsWin.DoomscrollMinutes);
                if (settingsWin.EnableScreenGuard)
                    _processMonitor.Start();
                else
                    _processMonitor.Stop();
            }
        }
    }

    private void AddLog(string message)
    {
        LogText.Text += $"{DateTime.Now:HH:mm:ss} - {message}\n";
        LogScrollViewer.ScrollToEnd();
    }

    private void UpdateAudioStatus(bool active)
    {
        AudioStatus.Text = active ? "Active" : "Inactive";
        AudioStatus.Foreground = active ? new SolidColorBrush(System.Windows.Media.Colors.LimeGreen) : new SolidColorBrush(System.Windows.Media.Colors.Red);
    }

    private void UpdateTTSStatus(string status)
    {
        TTSStatus.Text = status;
        TTSStatus.Foreground = status == "Speaking" ? new SolidColorBrush(System.Windows.Media.Colors.Yellow) : new SolidColorBrush(System.Windows.Media.Colors.LimeGreen);
    }

    private void UpdateSpeechStatus(bool listening)
    {
        SpeechStatus.Text = listening ? "Listening" : "Disabled";
        SpeechStatus.Foreground = listening ? new SolidColorBrush(System.Windows.Media.Colors.LimeGreen) : new SolidColorBrush(System.Windows.Media.Colors.Red);
    }

    private void UpdateVisionStatus(bool active)
    {
        VisionStatus.Text = active ? "Active" : "Disabled";
        VisionStatus.Foreground = active ? new SolidColorBrush(System.Windows.Media.Colors.LimeGreen) : new SolidColorBrush(System.Windows.Media.Colors.Red);
    }

    protected override void OnClosed(EventArgs e)
    {
        _audioCapture?.Dispose();
        _voiceServices?.Dispose();
        _processMonitor?.Dispose();
        _cameraVision?.Dispose();
        _notifyIcon?.Dispose();
        _ = _brainClient?.DisconnectAsync();
        base.OnClosed(e);
    }

    private static bool LoadBoolSetting(string key, bool fallback)
    {
        var value = SecureStorage.LoadSecureValue(key);
        return bool.TryParse(value, out var parsed) ? parsed : fallback;
    }

    private static int LoadIntSetting(string key, int fallback, int min, int max)
    {
        var value = SecureStorage.LoadSecureValue(key);
        return int.TryParse(value, out var parsed) ? Math.Clamp(parsed, min, max) : fallback;
    }
}
