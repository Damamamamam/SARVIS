using System;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Input;
using System.Windows.Media;

namespace JarvisWindows;

public partial class MainWindow : Window
{
    private BrainClient? _brainClient;
    private AudioCapture? _audioCapture;
    private VoiceServices? _voiceServices;
    private WindowAutomation? _windowAutomation;

    public MainWindow()
    {
        InitializeComponent();
        InitializeComponents();
    }

    private void InitializeComponents()
    {
        _brainClient = new BrainClient("ws://localhost:9741");
        _audioCapture = new AudioCapture();
        _voiceServices = new VoiceServices();
        _windowAutomation = new WindowAutomation();

        // Wire up events
        _brainClient.OnConnectionChanged += OnBrainConnectionChanged;
        _brainClient.OnMessage += OnBrainMessage;
        _audioCapture.OnAudioData += OnAudioData;
        _voiceServices.OnSpeakingStarted += OnSpeakingStarted;
        _voiceServices.OnSpeakingCompleted += OnSpeakingCompleted;

        // Connect to brain
        AddLog("Connecting to brain...");
        _ = _brainClient.ConnectAsync();

        // Start audio capture
        _audioCapture.StartRecording();
        UpdateAudioStatus(true);

        // Start listening
        _voiceServices.StartListening();
        UpdateSpeechStatus(true);
    }

    private void OnBrainConnectionChanged(bool connected)
    {
        Dispatcher.Invoke(() =>
        {
            if (connected)
            {
                ConnectionIndicator.Fill = new SolidColorBrush(Colors.LimeGreen);
                ConnectionStatus.Text = "Connected";
                AddLog("✓ Connected to brain");
            }
            else
            {
                ConnectionIndicator.Fill = new SolidColorBrush(Colors.Red);
                ConnectionStatus.Text = "Disconnected";
                AddLog("✗ Disconnected from brain");
            }
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
                            AddLog($"Brain: Speaking '{text}'");
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
                AddLog($"Error processing brain message: {ex.Message}");
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
                pcm = base64Audio,
                sampleRate = 16000,
                channels = 1
            }
        };
        _brainClient?.Send(message);
    }

    private void OnSpeakingStarted(string text)
    {
        Dispatcher.Invoke(() =>
        {
            AddLog($"Speaking: {text}");
            UpdateTTSStatus("Speaking");
            _audioCapture?.StopRecording();
            UpdateAudioStatus(false);
        });
    }

    private void OnSpeakingCompleted()
    {
        Dispatcher.Invoke(() =>
        {
            AddLog("Speaking completed");
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
            if (action == "minimize")
            {
                var hWnd = _windowAutomation?.GetActiveWindow();
                if (hWnd.HasValue && hWnd.Value != IntPtr.Zero)
                {
                    _windowAutomation?.MinimizeWindow(hWnd.Value);
                    AddLog("Window minimized");
                }
            }
            else if (action == "maximize")
            {
                var hWnd = _windowAutomation?.GetActiveWindow();
                if (hWnd.HasValue && hWnd.Value != IntPtr.Zero)
                {
                    _windowAutomation?.MaximizeWindow(hWnd.Value);
                    AddLog("Window maximized");
                }
            }
            else if (action == "type")
            {
                var text = payload["text"]?.ToString();
                var hWnd = _windowAutomation?.GetActiveWindow();
                if (!string.IsNullOrEmpty(text) && hWnd.HasValue && hWnd.Value != IntPtr.Zero)
                {
                    _windowAutomation?.SendText(hWnd.Value, text);
                    AddLog($"Typed: {text}");
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

    private void AddLog(string message)
    {
        LogText.Text += $"{DateTime.Now:HH:mm:ss} - {message}\n";
        LogScrollViewer.ScrollToEnd();
    }

    private void UpdateAudioStatus(bool active)
    {
        AudioStatus.Text = active ? "Active" : "Inactive";
        AudioStatus.Foreground = active ? new SolidColorBrush(Colors.LimeGreen) : new SolidColorBrush(Colors.Red);
    }

    private void UpdateTTSStatus(string status)
    {
        TTSStatus.Text = status;
        TTSStatus.Foreground = status == "Speaking" ? new SolidColorBrush(Colors.Yellow) : new SolidColorBrush(Colors.LimeGreen);
    }

    private void UpdateSpeechStatus(bool listening)
    {
        SpeechStatus.Text = listening ? "Listening" : "Disabled";
        SpeechStatus.Foreground = listening ? new SolidColorBrush(Colors.LimeGreen) : new SolidColorBrush(Colors.Red);
    }

    protected override void OnClosed(EventArgs e)
    {
        _audioCapture?.StopRecording();
        _voiceServices?.StopListening();
        _ = _brainClient?.DisconnectAsync();
        base.OnClosed(e);
    }
}