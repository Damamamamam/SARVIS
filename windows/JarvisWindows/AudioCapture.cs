using System;
using NAudio.Wave;

namespace JarvisWindows;

public class AudioCapture : IDisposable
{
    private WaveInEvent? _waveIn;
    private bool _isRecording = false;
    private int _sampleRate = 16000;
    private int _channels = 1;
    private int _deviceNumber = 0;

    public event Action<byte[], int, int>? OnAudioData;
    public event Action<float>? OnAudioLevel;
    public event Action<string>? OnError;

    public int SampleRate => _sampleRate;
    public int Channels => _channels;
    public bool IsRecording => _isRecording;

    public static int DeviceCount => WaveInEvent.DeviceCount;

    public static string GetDeviceName(int deviceNumber)
    {
        if (deviceNumber >= 0 && deviceNumber < WaveInEvent.DeviceCount)
        {
            var capabilities = WaveInEvent.GetCapabilities(deviceNumber);
            return capabilities.ProductName;
        }
        return "Default Device";
    }

    public void SetDevice(int deviceNumber)
    {
        _deviceNumber = Math.Clamp(deviceNumber, 0, Math.Max(0, WaveInEvent.DeviceCount - 1));
        if (_isRecording)
        {
            StopRecording();
            StartRecording();
        }
    }

    public void StartRecording(int sampleRate = 16000, int channels = 1)
    {
        if (_isRecording) return;

        _sampleRate = sampleRate;
        _channels = channels;

        try
        {
            _waveIn = new WaveInEvent
            {
                DeviceNumber = _deviceNumber,
                WaveFormat = new WaveFormat(_sampleRate, 16, _channels)
            };

            _waveIn.DataAvailable += (s, e) =>
            {
                if (e.BytesRecorded <= 0) return;

                OnAudioData?.Invoke(e.Buffer, 0, e.BytesRecorded);

                // Compute peak level for real-time audio visualization
                float maxSample = 0;
                for (int index = 0; index < e.BytesRecorded; index += 2)
                {
                    short sample = (short)((e.Buffer[index + 1] << 8) | e.Buffer[index]);
                    float absSample = Math.Abs((float)sample / 32768f);
                    if (absSample > maxSample)
                    {
                        maxSample = absSample;
                    }
                }

                OnAudioLevel?.Invoke(Math.Min(1.0f, maxSample));
            };

            _waveIn.RecordingStopped += (s, e) =>
            {
                _isRecording = false;
                OnAudioLevel?.Invoke(0f);
            };

            _waveIn.StartRecording();
            _isRecording = true;
        }
        catch (Exception ex)
        {
            OnError?.Invoke($"Failed to start audio capture: {ex.Message}");
            _isRecording = false;
        }
    }

    public void StopRecording()
    {
        if (_waveIn != null && _isRecording)
        {
            try
            {
                _waveIn.StopRecording();
            }
            catch { }
            finally
            {
                _waveIn.Dispose();
                _waveIn = null;
                _isRecording = false;
                OnAudioLevel?.Invoke(0f);
            }
        }
    }

    public void Dispose()
    {
        StopRecording();
    }
}