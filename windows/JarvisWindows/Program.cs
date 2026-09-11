using System;
using System.Text;
using System.Threading.Tasks;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;

namespace JarvisWindows;

class Program
{
    private static BrainClient? _brainClient;
    private static AudioCapture? _audioCapture;
    private static VoiceServices? _voiceServices;
    private static WindowAutomation? _windowAutomation;
    private static bool _isRunning = true;

    static async Task Main(string[] args)
    {
        Console.WriteLine("SARVIS Windows Client");
        Console.WriteLine("====================");

        // Initialize components
        _brainClient = new BrainClient("ws://localhost:9741");
        _audioCapture = new AudioCapture();
        _voiceServices = new VoiceServices();
        _windowAutomation = new WindowAutomation();

        // Wire up events
        _brainClient.OnConnectionChanged += OnBrainConnectionChanged;
        _brainClient.OnMessage += OnBrainMessage;
        _audioCapture.OnAudioData += OnAudioData;
        _voiceServices.OnSpeechRecognized += OnSpeechRecognized;
        _voiceServices.OnSpeakingStarted += OnSpeakingStarted;
        _voiceServices.OnSpeakingCompleted += OnSpeakingCompleted;

        // Connect to brain
        Console.WriteLine("Connecting to brain...");
        await _brainClient.ConnectAsync();

        // Start audio capture
        _audioCapture.StartRecording();

        // Start listening
        _voiceServices.StartListening();

        // Main loop
        Console.WriteLine("SARVIS is running. Press 'q' to quit, 's' to speak, 'h' for help.");
        while (_isRunning)
        {
            var input = Console.ReadLine();
            if (input?.ToLower() == "q")
            {
                _isRunning = false;
            }
            else if (input?.ToLower() == "s")
            {
                Console.WriteLine("Enter text to speak:");
                var text = Console.ReadLine();
                if (!string.IsNullOrEmpty(text))
                {
                    _voiceServices.Speak(text);
                }
            }
            else if (input?.ToLower() == "h")
            {
                PrintHelp();
            }
            else if (!string.IsNullOrEmpty(input))
            {
                // Send text to brain
                SendToBrain(input);
            }
        }

        // Cleanup
        _audioCapture.StopRecording();
        _voiceServices.StopListening();
        await _brainClient.DisconnectAsync();
    }

    private static void OnBrainConnectionChanged(bool connected)
    {
        Console.WriteLine($"Brain connection: {(connected ? "Connected" : "Disconnected")}");
    }

    private static void OnBrainMessage(string message)
    {
        try
        {
            var json = JObject.Parse(message);
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
            Console.WriteLine($"Failed to process brain message: {ex.Message}");
        }
    }

    private static void OnAudioData(byte[] buffer, int offset, int length)
    {
        // Send audio data to brain
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

    private static void OnSpeechRecognized(string text)
    {
        Console.WriteLine($"Recognized: {text}");
        SendToBrain(text);
    }

    private static void OnSpeakingStarted(string text)
    {
        Console.WriteLine($"Speaking: {text}");
        // Pause audio capture while speaking
        _audioCapture?.StopRecording();
    }

    private static void OnSpeakingCompleted()
    {
        Console.WriteLine("Speaking completed");
        // Resume audio capture
        _audioCapture?.StartRecording();
    }

    private static void SendToBrain(string text)
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

    private static void ProcessDeviceCommand(JToken payload)
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
                }
            }
            else if (action == "maximize")
            {
                var hWnd = _windowAutomation?.GetActiveWindow();
                if (hWnd.HasValue && hWnd.Value != IntPtr.Zero)
                {
                    _windowAutomation?.MaximizeWindow(hWnd.Value);
                }
            }
            else if (action == "type")
            {
                var text = payload["text"]?.ToString();
                var hWnd = _windowAutomation?.GetActiveWindow();
                if (!string.IsNullOrEmpty(text) && hWnd.HasValue && hWnd.Value != IntPtr.Zero)
                {
                    _windowAutomation?.SendText(hWnd.Value, text);
                }
            }
        }
        catch (Exception ex)
        {
            Console.WriteLine($"Failed to process device command: {ex.Message}");
        }
    }

    private static void PrintHelp()
    {
        Console.WriteLine("SARVIS Commands:");
        Console.WriteLine("  q - Quit");
        Console.WriteLine("  s - Speak text");
        Console.WriteLine("  h - Show this help");
        Console.WriteLine("  [any text] - Send to brain");
    }
}