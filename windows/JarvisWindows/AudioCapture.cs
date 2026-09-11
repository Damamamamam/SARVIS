using System;
using NAudio.Wave;

namespace JarvisWindows;

public class AudioCapture
{
    private WaveInEvent? _waveIn;
    private bool _isRecording = false;
    private readonly int _sampleRate = 16000;
    private readonly int _channels = 1;

    public event Action<byte[], int, int>? OnAudioData;

    public void StartRecording()
    {
        if (_isRecording) return;

        try
        {
            _waveIn = new WaveInEvent
            {
                WaveFormat = new WaveFormat(_sampleRate, _channels)
            };

            _waveIn.DataAvailable += (s, e) =>
            {
                OnAudioData?.Invoke(e.Buffer, 0, e.BytesRecorded);
            };

            _waveIn.RecordingStopped += (s, e) =>
            {
                _isRecording = false;
            };

            _waveIn.StartRecording();
            _isRecording = true;
            Console.WriteLine("Audio capture started");
        }
        catch (Exception ex)
        {
            Console.WriteLine($"Failed to start audio capture: {ex.Message}");
        }
    }

    public void StopRecording()
    {
        if (_waveIn != null && _isRecording)
        {
            _waveIn.StopRecording();
            _waveIn.Dispose();
            _waveIn = null;
            _isRecording = false;
            Console.WriteLine("Audio capture stopped");
        }
    }

    public bool IsRecording => _isRecording;
}