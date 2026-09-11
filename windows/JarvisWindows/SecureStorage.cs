using System;
using System.Text;
using Microsoft.Win32;
using System.Runtime.InteropServices;

namespace JarvisWindows;

public class SecureStorage
{
    private static readonly byte[] _entropy = Encoding.UTF8.GetBytes("SARVIS_SECURE_STORAGE_SALT");

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
        StringBuilder szDataDescr,
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

    private static string EncryptString(string plainText)
    {
        var data = Encoding.UTF8.GetBytes(plainText);
        var inputBlob = new DATA_BLOB { cbData = data.Length, pbData = Marshal.AllocHGlobal(data.Length) };
        Marshal.Copy(data, 0, inputBlob.pbData, data.Length);

        var entropyBlob = new DATA_BLOB { cbData = _entropy.Length, pbData = Marshal.AllocHGlobal(_entropy.Length) };
        Marshal.Copy(_entropy, 0, entropyBlob.pbData, _entropy.Length);

        var outputBlob = new DATA_BLOB();

        if (CryptProtectData(ref inputBlob, "SARVIS_DATA", ref entropyBlob, IntPtr.Zero, IntPtr.Zero, 0, ref outputBlob))
        {
            var encrypted = new byte[outputBlob.cbData];
            Marshal.Copy(outputBlob.pbData, encrypted, 0, outputBlob.cbData);
            Marshal.FreeHGlobal(inputBlob.pbData);
            Marshal.FreeHGlobal(entropyBlob.pbData);
            Marshal.FreeHGlobal(outputBlob.pbData);
            return Convert.ToBase64String(encrypted);
        }

        Marshal.FreeHGlobal(inputBlob.pbData);
        Marshal.FreeHGlobal(entropyBlob.pbData);
        throw new Exception("Failed to encrypt data");
    }

    private static string DecryptString(string encryptedText)
    {
        var encrypted = Convert.FromBase64String(encryptedText);
        var inputBlob = new DATA_BLOB { cbData = encrypted.Length, pbData = Marshal.AllocHGlobal(encrypted.Length) };
        Marshal.Copy(encrypted, 0, inputBlob.pbData, encrypted.Length);

        var entropyBlob = new DATA_BLOB { cbData = _entropy.Length, pbData = Marshal.AllocHGlobal(_entropy.Length) };
        Marshal.Copy(_entropy, 0, entropyBlob.pbData, _entropy.Length);

        var outputBlob = new DATA_BLOB();

        if (CryptUnprotectData(ref inputBlob, null, ref entropyBlob, IntPtr.Zero, IntPtr.Zero, 0, ref outputBlob))
        {
            var decrypted = new byte[outputBlob.cbData];
            Marshal.Copy(outputBlob.pbData, decrypted, 0, outputBlob.cbData);
            Marshal.FreeHGlobal(inputBlob.pbData);
            Marshal.FreeHGlobal(entropyBlob.pbData);
            Marshal.FreeHGlobal(outputBlob.pbData);
            return Encoding.UTF8.GetString(decrypted);
        }

        Marshal.FreeHGlobal(inputBlob.pbData);
        Marshal.FreeHGlobal(entropyBlob.pbData);
        throw new Exception("Failed to decrypt data");
    }
}