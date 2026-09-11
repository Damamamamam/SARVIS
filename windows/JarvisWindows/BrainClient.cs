using System;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using Newtonsoft.Json;
using Websocket.Client;
using System.Net.WebSockets;

namespace JarvisWindows;

public class BrainClient
{
    private IWebsocketClient? _client;
    private readonly string _url;
    private bool _isConnected = false;

    public event Action<string>? OnMessage;
    public event Action<bool>? OnConnectionChanged;

    public BrainClient(string url = "ws://localhost:9741")
    {
        _url = url;
    }

    public async Task ConnectAsync()
    {
        try
        {
            _client = new WebsocketClient(new Uri(_url));
            
            _client.MessageReceived.Subscribe(msg =>
            {
                OnMessage?.Invoke(msg.Text);
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
            });

            await _client.Start();
            _isConnected = true;
            OnConnectionChanged?.Invoke(true);
        }
        catch (Exception ex)
        {
            Console.WriteLine($"Failed to connect to brain: {ex.Message}");
            _isConnected = false;
            OnConnectionChanged?.Invoke(false);
        }
    }

    public void Send(object payload)
    {
        if (_client == null || !_isConnected)
        {
            Console.WriteLine("Not connected to brain");
            return;
        }

        try
        {
            var json = JsonConvert.SerializeObject(payload);
            _client.Send(json);
        }
        catch (Exception ex)
        {
            Console.WriteLine($"Failed to send message: {ex.Message}");
        }
    }

    public async Task DisconnectAsync()
    {
        if (_client != null)
        {
            await _client.Stop(WebSocketCloseStatus.NormalClosure, "Client disconnecting");
            _isConnected = false;
            OnConnectionChanged?.Invoke(false);
        }
    }

    public bool IsConnected => _isConnected;
}