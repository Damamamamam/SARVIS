using System;
using System.Globalization;
using System.Speech.Recognition;
using System.Speech.Synthesis;

namespace JarvisWindows;

public class VoiceServices : IDisposable
{
    private SpeechSynthesizer? _synthesizer;
    private SpeechRecognitionEngine? _recognizer;
    private bool _isListening = false;
    private bool _isSpeaking = false;
    private string _currentLanguage = "en-US";

    public event Action<string>? OnSpeechRecognized;
    public event Action<string>? OnSpeechHypothesized;
    public event Action<string>? OnSpeakingStarted;
    public event Action? OnSpeakingCompleted;
    public event Action<string>? OnError;

    public bool IsListening => _isListening;
    public bool IsSpeaking => _isSpeaking;
    public string CurrentLanguage => _currentLanguage;

    public VoiceServices(string? cultureName = "en-US")
    {
        _currentLanguage = cultureName ?? "en-US";
        InitializeSynthesizer();
        InitializeRecognizer(_currentLanguage);
    }

    private void InitializeSynthesizer()
    {
        try
        {
            _synthesizer = new SpeechSynthesizer();
            _synthesizer.SetOutputToDefaultAudioDevice();
            _synthesizer.SpeakStarted += (s, e) =>
            {
                _isSpeaking = true;
                PauseRecognitionForSpeech();
            };
            _synthesizer.SpeakCompleted += (s, e) =>
            {
                _isSpeaking = false;
                OnSpeakingCompleted?.Invoke();
                ResumeRecognitionAfterSpeech();
            };
        }
        catch (Exception ex)
        {
            OnError?.Invoke($"Failed to initialize TTS synthesizer: {ex.Message}");
        }
    }

    private void InitializeRecognizer(string cultureName)
    {
        try
        {
            CultureInfo culture;
            try
            {
                culture = new CultureInfo(cultureName);
            }
            catch
            {
                culture = CultureInfo.CurrentCulture;
            }

            // Find an installed recognizer matching or fallback
            RecognizerInfo? selectedRecognizer = null;
            foreach (var ri in SpeechRecognitionEngine.InstalledRecognizers())
            {
                if (ri.Culture.Name.Equals(culture.Name, StringComparison.OrdinalIgnoreCase) ||
                    ri.Culture.TwoLetterISOLanguageName.Equals(culture.TwoLetterISOLanguageName, StringComparison.OrdinalIgnoreCase))
                {
                    selectedRecognizer = ri;
                    break;
                }
            }

            if (selectedRecognizer == null)
            {
                var installed = SpeechRecognitionEngine.InstalledRecognizers();
                if (installed.Count > 0)
                {
                    selectedRecognizer = installed[0];
                }
            }

            if (selectedRecognizer != null)
            {
                _recognizer = new SpeechRecognitionEngine(selectedRecognizer);
                _recognizer.SetInputToDefaultAudioDevice();

                // 1. Add dictation grammar for open speech
                var dictationGrammar = new DictationGrammar();
                dictationGrammar.Name = "DefaultDictation";
                _recognizer.LoadGrammar(dictationGrammar);

                // 2. Add command grammar for high-confidence assistant control words
                var choices = new Choices();
                choices.Add(new string[] {
                    "jarvis", "sarvis", "hey jarvis", "hey sarvis",
                    "minimize", "maximize", "restore window",
                    "open settings", "close settings",
                    "stop listening", "start listening",
                    "mute", "unmute", "status", "reconnect"
                });
                var gb = new GrammarBuilder(choices);
                var commandGrammar = new Grammar(gb) { Name = "AssistantCommands" };
                _recognizer.LoadGrammar(commandGrammar);

                _recognizer.SpeechRecognized += (s, e) =>
                {
                    if (e.Result != null && e.Result.Confidence > 0.35f && !string.IsNullOrWhiteSpace(e.Result.Text))
                    {
                        OnSpeechRecognized?.Invoke(e.Result.Text);
                    }
                };

                _recognizer.SpeechHypothesized += (s, e) =>
                {
                    if (e.Result != null && !string.IsNullOrWhiteSpace(e.Result.Text))
                    {
                        OnSpeechHypothesized?.Invoke(e.Result.Text);
                    }
                };

                _recognizer.RecognizeCompleted += (s, e) =>
                {
                    // Auto-restart continuous recognition if listening flag remains set
                    if (_isListening && !_isSpeaking)
                    {
                        try
                        {
                            _recognizer.RecognizeAsync(RecognizeMode.Multiple);
                        }
                        catch { }
                    }
                };
            }
        }
        catch (Exception ex)
        {
            OnError?.Invoke($"Speech recognition initialization failed: {ex.Message}");
        }
    }

    public void SetLanguage(string cultureName)
    {
        _currentLanguage = cultureName;
        bool wasListening = _isListening;
        StopListening();
        _recognizer?.Dispose();
        _recognizer = null;
        InitializeRecognizer(cultureName);
        if (wasListening)
        {
            StartListening();
        }
    }

    public void StartListening()
    {
        if (_isListening) return;

        try
        {
            if (_recognizer != null)
            {
                _recognizer.RecognizeAsync(RecognizeMode.Multiple);
                _isListening = true;
            }
        }
        catch (Exception ex)
        {
            OnError?.Invoke($"Failed to start speech recognition: {ex.Message}");
        }
    }

    public void StopListening()
    {
        if (!_isListening) return;

        try
        {
            _recognizer?.RecognizeAsyncCancel();
        }
        catch { }
        finally
        {
            _isListening = false;
        }
    }

    private void PauseRecognitionForSpeech()
    {
        if (_isListening && _recognizer != null)
        {
            try
            {
                _recognizer.RecognizeAsyncCancel();
            }
            catch { }
        }
    }

    private void ResumeRecognitionAfterSpeech()
    {
        if (_isListening && _recognizer != null)
        {
            try
            {
                _recognizer.RecognizeAsync(RecognizeMode.Multiple);
            }
            catch { }
        }
    }

    public void Speak(string text)
    {
        if (string.IsNullOrWhiteSpace(text)) return;

        try
        {
            OnSpeakingStarted?.Invoke(text);

            if (_synthesizer != null)
            {
                _synthesizer.SpeakAsyncCancelAll();
                _synthesizer.SpeakAsync(text);
            }
            else
            {
                // Fallback to COM SAPI SpVoice
                Type? t = Type.GetTypeFromProgID("SAPI.SpVoice");
                if (t != null)
                {
                    dynamic? voice = Activator.CreateInstance(t);
                    voice?.Speak(text);
                    OnSpeakingCompleted?.Invoke();
                }
            }
        }
        catch (Exception ex)
        {
            OnError?.Invoke($"TTS failed: {ex.Message}");
            OnSpeakingCompleted?.Invoke();
        }
    }

    public void StopSpeaking()
    {
        try
        {
            _synthesizer?.SpeakAsyncCancelAll();
            _isSpeaking = false;
            OnSpeakingCompleted?.Invoke();
        }
        catch { }
    }

    public void Dispose()
    {
        StopListening();
        StopSpeaking();
        _synthesizer?.Dispose();
        _synthesizer = null;
        _recognizer?.Dispose();
        _recognizer = null;
    }
}