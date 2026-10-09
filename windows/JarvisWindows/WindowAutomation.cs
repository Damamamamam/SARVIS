using System;
using System.Diagnostics;
using System.IO;
using System.Runtime.InteropServices;
using System.Text;

namespace JarvisWindows;

public class WindowAutomation
{
    [DllImport("user32.dll")]
    private static extern IntPtr GetForegroundWindow();

    [DllImport("user32.dll")]
    private static extern bool SetForegroundWindow(IntPtr hWnd);

    [DllImport("user32.dll", SetLastError = true, CharSet = CharSet.Auto)]
    private static extern IntPtr FindWindow(string? lpClassName, string? lpWindowName);

    [DllImport("user32.dll")]
    private static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);

    [DllImport("user32.dll")]
    private static extern bool PostMessage(IntPtr hWnd, uint Msg, IntPtr wParam, IntPtr lParam);

    [DllImport("user32.dll")]
    private static extern IntPtr SendMessage(IntPtr hWnd, uint Msg, IntPtr wParam, IntPtr lParam);

    [DllImport("user32.dll")]
    private static extern bool SetCursorPos(int X, int Y);

    [DllImport("user32.dll")]
    private static extern bool GetCursorPos(out POINT lpPoint);

    [DllImport("user32.dll")]
    private static extern void mouse_event(uint dwFlags, uint dx, uint dy, uint dwData, UIntPtr dwExtraInfo);

    [DllImport("user32.dll")]
    private static extern void keybd_event(byte bVk, byte bScan, uint dwFlags, UIntPtr dwExtraInfo);

    [DllImport("user32.dll", SetLastError = true)]
    private static extern bool LockWorkStation();

    [DllImport("user32.dll", SetLastError = true, CharSet = CharSet.Auto)]
    private static extern int GetWindowText(IntPtr hWnd, StringBuilder lpString, int nMaxCount);

    [DllImport("user32.dll", SetLastError = true)]
    private static extern int GetWindowTextLength(IntPtr hWnd);

    [StructLayout(LayoutKind.Sequential)]
    public struct POINT
    {
        public int X;
        public int Y;
    }

    private const int WM_KEYDOWN = 0x0100;
    private const int WM_KEYUP = 0x0101;
    private const int SW_MINIMIZE = 6;
    private const int SW_MAXIMIZE = 3;
    private const int SW_RESTORE = 9;

    private const uint MOUSEEVENTF_LEFTDOWN = 0x0002;
    private const uint MOUSEEVENTF_LEFTUP = 0x0004;
    private const uint MOUSEEVENTF_RIGHTDOWN = 0x0008;
    private const uint MOUSEEVENTF_RIGHTUP = 0x0010;
    private const uint MOUSEEVENTF_WHEEL = 0x0800;

    private const uint KEYEVENTF_KEYUP = 0x0002;

    public const byte VK_VOLUME_MUTE = 0xAD;
    public const byte VK_VOLUME_DOWN = 0xAE;
    public const byte VK_VOLUME_UP = 0xAF;
    public const byte VK_CONTROL = 0x11;
    public const byte VK_SHIFT = 0x10;
    public const byte VK_MENU = 0x12; // Alt
    public const byte VK_LWIN = 0x5B;

    public IntPtr? GetActiveWindow()
    {
        var handle = GetForegroundWindow();
        return handle != IntPtr.Zero ? handle : null;
    }

    public bool ActivateWindow(IntPtr hWnd)
    {
        return SetForegroundWindow(hWnd);
    }

    public IntPtr? FindWindowByTitle(string title)
    {
        var handle = FindWindow(null, title);
        return handle != IntPtr.Zero ? handle : null;
    }

    public bool MinimizeWindow(IntPtr hWnd)
    {
        return ShowWindow(hWnd, SW_MINIMIZE);
    }

    public bool MaximizeWindow(IntPtr hWnd)
    {
        return ShowWindow(hWnd, SW_MAXIMIZE);
    }

    public bool RestoreWindow(IntPtr hWnd)
    {
        return ShowWindow(hWnd, SW_RESTORE);
    }

    public void SendKeyPress(IntPtr hWnd, byte key)
    {
        PostMessage(hWnd, WM_KEYDOWN, (IntPtr)key, IntPtr.Zero);
        PostMessage(hWnd, WM_KEYUP, (IntPtr)key, IntPtr.Zero);
    }

    public void SendText(IntPtr hWnd, string text)
    {
        foreach (char c in text)
        {
            SendKeyPress(hWnd, (byte)c);
        }
    }

    public string GetWindowTitle(IntPtr hWnd)
    {
        var length = GetWindowTextLength(hWnd);
        if (length == 0) return string.Empty;

        var builder = new StringBuilder(length + 1);
        GetWindowText(hWnd, builder, builder.Capacity);
        return builder.ToString();
    }

    // === Mouse Control ===

    public void MoveMouse(int x, int y)
    {
        SetCursorPos(x, y);
    }

    public (int X, int Y) GetMousePosition()
    {
        if (GetCursorPos(out POINT p))
        {
            return (p.X, p.Y);
        }
        return (0, 0);
    }

    public void MouseLeftClick(int? x = null, int? y = null)
    {
        if (x.HasValue && y.HasValue)
        {
            SetCursorPos(x.Value, y.Value);
        }
        mouse_event(MOUSEEVENTF_LEFTDOWN, 0, 0, 0, UIntPtr.Zero);
        mouse_event(MOUSEEVENTF_LEFTUP, 0, 0, 0, UIntPtr.Zero);
    }

    public void MouseRightClick(int? x = null, int? y = null)
    {
        if (x.HasValue && y.HasValue)
        {
            SetCursorPos(x.Value, y.Value);
        }
        mouse_event(MOUSEEVENTF_RIGHTDOWN, 0, 0, 0, UIntPtr.Zero);
        mouse_event(MOUSEEVENTF_RIGHTUP, 0, 0, 0, UIntPtr.Zero);
    }

    public void MouseDoubleClick(int? x = null, int? y = null)
    {
        MouseLeftClick(x, y);
        System.Threading.Thread.Sleep(50);
        MouseLeftClick(x, y);
    }

    public void MouseScroll(int delta)
    {
        mouse_event(MOUSEEVENTF_WHEEL, 0, 0, (uint)delta, UIntPtr.Zero);
    }

    // === Keyboard Shortcuts ===

    public void SendKeyCombination(byte modifierKey, byte key)
    {
        keybd_event(modifierKey, 0, 0, UIntPtr.Zero);
        keybd_event(key, 0, 0, UIntPtr.Zero);
        keybd_event(key, 0, KEYEVENTF_KEYUP, UIntPtr.Zero);
        keybd_event(modifierKey, 0, KEYEVENTF_KEYUP, UIntPtr.Zero);
    }

    public void SendGlobalKey(byte key)
    {
        keybd_event(key, 0, 0, UIntPtr.Zero);
        keybd_event(key, 0, KEYEVENTF_KEYUP, UIntPtr.Zero);
    }

    // === System Settings Control ===

    public void VolumeUp(int times = 2)
    {
        for (int i = 0; i < times; i++)
        {
            SendGlobalKey(VK_VOLUME_UP);
        }
    }

    public void VolumeDown(int times = 2)
    {
        for (int i = 0; i < times; i++)
        {
            SendGlobalKey(VK_VOLUME_DOWN);
        }
    }

    public void VolumeMute()
    {
        SendGlobalKey(VK_VOLUME_MUTE);
    }

    public void LockScreen()
    {
        LockWorkStation();
    }

    // === Application Launching & Management ===

    public bool LaunchApp(string appOrCommand)
    {
        try
        {
            var clean = appOrCommand.Trim().ToLowerInvariant();
            var fileName = clean;
            var arguments = "";

            switch (clean)
            {
                case "chrome":
                    fileName = "chrome.exe";
                    break;
                case "edge":
                case "browser":
                    fileName = "msedge.exe";
                    break;
                case "notepad":
                    fileName = "notepad.exe";
                    break;
                case "calc":
                case "calculator":
                    fileName = "calc.exe";
                    break;
                case "cmd":
                case "command prompt":
                    fileName = "cmd.exe";
                    break;
                case "terminal":
                    fileName = "wt.exe";
                    break;
                case "code":
                case "vscode":
                    fileName = "code";
                    break;
                case "explorer":
                    fileName = "explorer.exe";
                    break;
                case "settings":
                    fileName = "ms-settings:";
                    break;
                case "taskmgr":
                    fileName = "taskmgr.exe";
                    break;
            }

            var startInfo = new ProcessStartInfo
            {
                FileName = fileName,
                Arguments = arguments,
                UseShellExecute = true
            };

            Process.Start(startInfo);
            return true;
        }
        catch (Exception ex)
        {
            Console.WriteLine($"LaunchApp failed: {ex.Message}");
            return false;
        }
    }

    public bool CloseApp(string processName)
    {
        try
        {
            var name = processName.Replace(".exe", "");
            var processes = Process.GetProcessesByName(name);
            foreach (var p in processes)
            {
                p.CloseMainWindow();
            }
            return processes.Length > 0;
        }
        catch
        {
            return false;
        }
    }

    // === File System Helpers ===

    public void OpenFolder(string path)
    {
        if (Directory.Exists(path))
        {
            Process.Start(new ProcessStartInfo("explorer.exe", path) { UseShellExecute = true });
        }
    }
}