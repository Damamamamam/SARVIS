using System;
using System.Runtime.InteropServices;
using System.Text;

namespace JarvisWindows;

public class WindowAutomation
{
    [DllImport("user32.dll")]
    private static extern IntPtr GetForegroundWindow();

    [DllImport("user32.dll")]
    private static extern bool SetForegroundWindow(IntPtr hWnd);

    [DllImport("user32.dll")]
    private static extern IntPtr FindWindow(string lpClassName, string lpWindowName);

    [DllImport("user32.dll")]
    private static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);

    [DllImport("user32.dll")]
    private static extern bool PostMessage(IntPtr hWnd, uint Msg, IntPtr wParam, IntPtr lParam);

    [DllImport("user32.dll")]
    private static extern IntPtr SendMessage(IntPtr hWnd, uint Msg, IntPtr wParam, IntPtr lParam);

    private const int WM_KEYDOWN = 0x0100;
    private const int WM_KEYUP = 0x0101;
    private const int WM_LBUTTONDOWN = 0x0201;
    private const int WM_LBUTTONUP = 0x0202;
    private const int SW_MINIMIZE = 6;
    private const int SW_MAXIMIZE = 3;
    private const int SW_RESTORE = 9;

    public IntPtr? GetActiveWindow()
    {
        return GetForegroundWindow();
    }

    public bool ActivateWindow(IntPtr hWnd)
    {
        return SetForegroundWindow(hWnd);
    }

    public IntPtr? FindWindowByTitle(string title)
    {
        return FindWindow(null, title);
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

    [DllImport("user32.dll", SetLastError = true, CharSet = CharSet.Auto)]
    private static extern int GetWindowText(IntPtr hWnd, StringBuilder lpString, int nMaxCount);

    [DllImport("user32.dll", SetLastError = true, CharSet = CharSet.Auto)]
    private static extern int GetWindowTextLength(IntPtr hWnd);
}