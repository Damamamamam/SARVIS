using System;
using System.Collections.Concurrent;
using System.Net.Security;
using System.Net.WebSockets;
using System.Security.Cryptography.X509Certificates;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using Newtonsoft.Json;
using Websocket.Client;

namespace JarvisWindows;

public class BrainClient : IDisposable
{
    private WebsocketClient? _client;
    private string _url;
    private bool _isConnected = false;
    private readonly ConcurrentQueue<string> _messageQueue = new();
    private readonly CancellationTokenSource _cts = new();

    public event Action<string>? OnMessage;
    public event Action<bool>? OnConnectionChanged;
    public event Action<string>? OnError;

    public string Url => _url;
    public bool IsConnected => _isConnected;
    public int QueuedMessageCount => _messageQueue.Count;

    public BrainClient(string url = "ws://localhost:9741")
    {
        _url = url;
    }

    public void UpdateUrl(string newUrl)
    {
        if (string.IsNullOrWhiteSpace(newUrl)) return;
        _url = newUrl;
    }

    public async Task ConnectAsync()
    {
        try
        {
            await DisconnectAsync();

            var uri = new Uri(_url);
            var factory = new Func<ClientWebSocket>(() =>
            {
                var ws = new ClientWebSocket();
                if (uri.Scheme.Equals("wss", StringComparison.OrdinalIgnoreCase))
                {
                    ws.Options.RemoteCertificateValidationCallback = ValidateServerCertificate;
                }
                return ws;
            });

            _client = new WebsocketClient(uri, factory)
            {
                ReconnectTimeout = TimeSpan.FromSeconds(5),
                ErrorReconnectTimeout = TimeSpan.FromSeconds(5)
            };

            _client.MessageReceived.Subscribe(msg =>
            {
                if (!string.IsNullOrEmpty(msg.Text))
                {
                    OnMessage?.Invoke(msg.Text);
                }
            });

            _client.DisconnectionHappened.Subscribe(info =>
            {
                _isConnected = false;
                OnConnectionChanged?.Invoke(false);
            });

            _client.ReconnectionHappened.Subscribe(info =>
            {
                _isConnected = true;
                OnConnectionChanged?.Invoke(true);
                FlushMessageQueue();
            });

            await _client.Start();
            _isConnected = true;
            OnConnectionChanged?.Invoke(true);
            FlushMessageQueue();
        }
        catch (Exception ex)
        {
            _isConnected = false;
            OnError?.Invoke($"Connection failed: {ex.Message}");
            OnConnectionChanged?.Invoke(false);
        }
    }

    private bool ValidateServerCertificate(object sender, X509Certificate? certificate, X509Chain? chain, SslPolicyErrors sslPolicyErrors)
    {
        // Allow localhost development certificates or validate chain
        if (_url.Contains("localhost") || _url.Contains("127.0.0.1"))
        {
            return true;
        }
        return sslPolicyErrors == SslPolicyErrors.None;
    }

    public void Send(object payload)
    {
        try
        {
            var json = JsonConvert.SerializeObject(payload);
            if (_client != null && _isConnected)
            {
                _client.Send(json);
            }
            else
            {
                // Queue message for offline resilience
                _messageQueue.Enqueue(json);
                if (_messageQueue.Count > 500)
                {
                    _messageQueue.TryDequeue(out _);
                }
            }
        }
        catch (Exception ex)
        {
            OnError?.Invoke($"Failed to send message: {ex.Message}");
        }
    }

    private void FlushMessageQueue()
    {
        Task.Run(() =>
        {
            while (_isConnected && _client != null && _messageQueue.TryDequeue(out var msg))
            {
                try
                {
                    _client.Send(msg);
                }
                catch
                {
                    _messageQueue.Enqueue(msg);
                    break;
                }
            }
        });
    }

    public async Task ReconnectAsync()
    {
        await ConnectAsync();
    }

    public async Task DisconnectAsync()
    {
        if (_client != null)
        {
            try
            {
                await _client.Stop(WebSocketCloseStatus.NormalClosure, "Client disconnecting");
                _client.Dispose();
            }
            catch { }
            finally
            {
                _client = null;
                _isConnected = false;
                OnConnectionChanged?.Invoke(false);
            }
        }
    }

    public void Dispose()
    {
        _cts.Cancel();
        _cts.Dispose();
        _ = DisconnectAsync();
    }
}