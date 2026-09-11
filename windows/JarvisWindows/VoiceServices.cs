using System;
using System.Runtime.InteropServices;

namespace JarvisWindows;

public class VoiceServices
{
    private bool _isListening = false;

    public event Action<string>? OnSpeechRecognized;
    public event Action<string>? OnSpeakingStarted;
    public event Action? OnSpeakingCompleted;

    public void StartListening()
    {
        // STT will be implemented via the brain - Windows client sends audio
        _isListening = true;
        Console.WriteLine("Speech recognition enabled (via brain)");
    }

    public void StopListening()
    {
        _isListening = false;
        Console.WriteLine("Speech recognition disabled");
    }

    public void Speak(string text)
    {
        try
        {
            // Use Windows Speech API via COM
            Type t = Type.GetTypeFromProgID("SAPI.SpVoice");
            if (t != null)
            {
                dynamic voice = Activator.CreateInstance(t);
                voice.Speak(text);
                OnSpeakingStarted?.Invoke(text);
                OnSpeakingCompleted?.Invoke();
            }
        }
        catch (Exception ex)
        {
            Console.WriteLine($"Failed to speak: {ex.Message}");
        }
    }

    public bool IsListening => _isListening;
}