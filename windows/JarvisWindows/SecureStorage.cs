using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Text;
using System.Text.RegularExpressions;
using Microsoft.Win32;

namespace JarvisWindows;

public class SecureStorage
{
    private static readonly byte[] _entropy = Encoding.UTF8.GetBytes("SARVIS_SECURE_STORAGE_SALT_2026");

    [DllImport("crypt32.dll", CharSet = CharSet.Auto, SetLastError = true)]
    private static extern bool CryptProtectData(
        ref DATA_BLOB pDataIn,
        string szDataDescr,
        ref DATA_BLOB pOptionalEntropy,
        IntPtr pvReserved,
        IntPtr pPromptStruct,
        int dwFlags,
        ref DATA_BLOB pDataOut);

    [DllImport("crypt32.dll", CharSet = CharSet.Auto, SetLastError = true)]
    private static extern bool CryptUnprotectData(
        ref DATA_BLOB pDataIn,
        IntPtr szDataDescr,
        ref DATA_BLOB pOptionalEntropy,
        IntPtr pvReserved,
        IntPtr pPromptStruct,
        int dwFlags,
        ref DATA_BLOB pDataOut);

    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    private struct DATA_BLOB
    {
        public int cbData;
        public IntPtr pbData;
    }

    public static bool ValidateApiKey(string provider, string key)
    {
        if (string.IsNullOrWhiteSpace(key)) return false;
        var trimmed = key.Trim();

        switch (provider.ToLowerInvariant())
        {
            case "gemini":
                return trimmed.Length >= 25 && (trimmed.StartsWith("AIzaSy") || trimmed.Length >= 35);
            case "groq":
                return trimmed.StartsWith("gsk_") && trimmed.Length >= 30;
            case "openrouter":
                return trimmed.StartsWith("sk-or-") && trimmed.Length >= 30;
            case "mistral":
            case "cerebras":
            case "together":
            case "cohere":
            case "deepseek":
                return trimmed.Length >= 20;
            default:
                return trimmed.Length >= 10;
        }
    }

    public static void SaveSecureValue(string key, string value)
    {
        try
        {
            var encrypted = EncryptString(value);
            using var keyPath = Registry.CurrentUser.CreateSubKey($@"Software\Jarvis\SecureStorage");
            keyPath?.SetValue(key, encrypted);
        }
        catch (Exception ex)
        {
            Console.WriteLine($"Failed to save secure value: {ex.Message}");
        }
    }

    public static string? LoadSecureValue(string key)
    {
        try
        {
            using var keyPath = Registry.CurrentUser.OpenSubKey($@"Software\Jarvis\SecureStorage");
            var encrypted = keyPath?.GetValue(key) as string;
            if (string.IsNullOrEmpty(encrypted))
                return null;

            return DecryptString(encrypted);
        }
        catch (Exception ex)
        {
            Console.WriteLine($"Failed to load secure value: {ex.Message}");
            return null;
        }
    }

    public static void DeleteSecureValue(string key)
    {
        try
        {
            using var keyPath = Registry.CurrentUser.OpenSubKey($@"Software\Jarvis\SecureStorage", true);
            keyPath?.DeleteValue(key, false);
        }
        catch (Exception ex)
        {
            Console.WriteLine($"Failed to delete secure value: {ex.Message}");
        }
    }

    public static Dictionary<string, string> LoadAllConfiguredKeys()
    {
        var result = new Dictionary<string, string>();
        string[] providers = ["gemini", "groq", "openrouter", "mistral", "cerebras", "together", "cohere", "deepseek"];
        foreach (var p in providers)
        {
            var val = LoadSecureValue($"API_KEY_{p.ToUpperInvariant()}");
            if (!string.IsNullOrEmpty(val))
            {
                result[p] = val;
            }
        }
        return result;
    }

    private static string EncryptString(string plainText)
    {
        var data = Encoding.UTF8.GetBytes(plainText);
        var inputBlob = new DATA_BLOB { cbData = data.Length, pbData = Marshal.AllocHGlobal(data.Length) };
        Marshal.Copy(data, 0, inputBlob.pbData, data.Length);

        var entropyBlob = new DATA_BLOB { cbData = _entropy.Length, pbData = Marshal.AllocHGlobal(_entropy.Length) };
        Marshal.Copy(_entropy, 0, entropyBlob.pbData, _entropy.Length);

        var outputBlob = new DATA_BLOB();

        try
        {
            if (CryptProtectData(ref inputBlob, "SARVIS_DATA", ref entropyBlob, IntPtr.Zero, IntPtr.Zero, 0, ref outputBlob))
            {
                var encrypted = new byte[outputBlob.cbData];
                Marshal.Copy(outputBlob.pbData, encrypted, 0, outputBlob.cbData);
                return Convert.ToBase64String(encrypted);
            }
            throw new Exception("CryptProtectData failed.");
        }
        finally
        {
            Marshal.FreeHGlobal(inputBlob.pbData);
            Marshal.FreeHGlobal(entropyBlob.pbData);
            if (outputBlob.pbData != IntPtr.Zero)
            {
                Marshal.FreeHGlobal(outputBlob.pbData);
            }
        }
    }

    private static string DecryptString(string encryptedText)
    {
        var encrypted = Convert.FromBase64String(encryptedText);
        var inputBlob = new DATA_BLOB { cbData = encrypted.Length, pbData = Marshal.AllocHGlobal(encrypted.Length) };
        Marshal.Copy(encrypted, 0, inputBlob.pbData, encrypted.Length);

        var entropyBlob = new DATA_BLOB { cbData = _entropy.Length, pbData = Marshal.AllocHGlobal(_entropy.Length) };
        Marshal.Copy(_entropy, 0, entropyBlob.pbData, _entropy.Length);

        var outputBlob = new DATA_BLOB();

        try
        {
            if (CryptUnprotectData(ref inputBlob, IntPtr.Zero, ref entropyBlob, IntPtr.Zero, IntPtr.Zero, 0, ref outputBlob))
            {
                var decrypted = new byte[outputBlob.cbData];
                Marshal.Copy(outputBlob.pbData, decrypted, 0, outputBlob.cbData);
                return Encoding.UTF8.GetString(decrypted);
            }
            throw new Exception("CryptUnprotectData failed.");
        }
        finally
        {
            Marshal.FreeHGlobal(inputBlob.pbData);
            Marshal.FreeHGlobal(entropyBlob.pbData);
            if (outputBlob.pbData != IntPtr.Zero)
            {
                Marshal.FreeHGlobal(outputBlob.pbData);
            }
        }
    }
}