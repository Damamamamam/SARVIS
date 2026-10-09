using System;
using System.Collections.Generic;
using System.Windows;
using System.Windows.Controls;

namespace JarvisWindows;

public partial class SettingsWindow : Window
{
    public string BrainUrl => BrainUrlBox.Text.Trim();
    public bool EnableCameraTracking => CameraTrackingCheck.IsChecked == true;
    public bool EnableContinuousStt => ContinuousSttCheck.IsChecked == true;
    public bool EnableScreenGuard => ScreenTimeGuardCheck.IsChecked == true;
    public string SelectedLanguage => (LanguageCombo.SelectedItem as ComboBoxItem)?.Content?.ToString() ?? "en-US";
    public int DoomscrollMinutes => int.TryParse(DoomscrollMinsBox.Text.Trim(), out var m) ? Math.Max(1, m) : 25;
    public int RetryTimeoutSeconds => int.TryParse(RetryTimeoutBox.Text.Trim(), out var s) ? Math.Clamp(s, 1, 120) : 5;
    public bool EnableAutoReconnect => AutoReconnectCheck.IsChecked == true;

    public SettingsWindow()
    {
        InitializeComponent();
        LoadExistingSettings();
    }

    private void LoadExistingSettings()
    {
        // Load API keys securely from DPAPI
        GeminiKeyBox.Password = SecureStorage.LoadSecureValue("API_KEY_GEMINI") ?? "";
        GroqKeyBox.Password = SecureStorage.LoadSecureValue("API_KEY_GROQ") ?? "";
        OpenRouterKeyBox.Password = SecureStorage.LoadSecureValue("API_KEY_OPENROUTER") ?? "";
        MistralKeyBox.Password = SecureStorage.LoadSecureValue("API_KEY_MISTRAL") ?? "";
        CerebrasKeyBox.Password = SecureStorage.LoadSecureValue("API_KEY_CEREBRAS") ?? "";
        TogetherKeyBox.Password = SecureStorage.LoadSecureValue("API_KEY_TOGETHER") ?? "";
        CohereKeyBox.Password = SecureStorage.LoadSecureValue("API_KEY_COHERE") ?? "";
        DeepSeekKeyBox.Password = SecureStorage.LoadSecureValue("API_KEY_DEEPSEEK") ?? "";

        // Brain connection url
        var url = SecureStorage.LoadSecureValue("BRAIN_WS_URL");
        if (!string.IsNullOrEmpty(url))
        {
            BrainUrlBox.Text = url;
        }

        CameraTrackingCheck.IsChecked = LoadBool("ENABLE_CAMERA_TRACKING", true);
        ContinuousSttCheck.IsChecked = LoadBool("ENABLE_CONTINUOUS_STT", true);
        ScreenTimeGuardCheck.IsChecked = LoadBool("ENABLE_SCREEN_GUARD", true);
        AutoReconnectCheck.IsChecked = LoadBool("ENABLE_AUTO_RECONNECT", true);
        DoomscrollMinsBox.Text = SecureStorage.LoadSecureValue("DOOMSCROLL_MINUTES") ?? "25";
        RetryTimeoutBox.Text = SecureStorage.LoadSecureValue("RETRY_TIMEOUT_SECONDS") ?? "5";

        var language = SecureStorage.LoadSecureValue("SPEECH_LANGUAGE") ?? "en-US";
        foreach (ComboBoxItem item in LanguageCombo.Items)
        {
            if (string.Equals(item.Content?.ToString(), language, StringComparison.OrdinalIgnoreCase))
            {
                item.IsSelected = true;
                break;
            }
        }
    }

    private void SaveButton_Click(object sender, RoutedEventArgs e)
    {
        try
        {
            // Validate API keys format before saving
            var validationErrors = new List<string>();

            if (!string.IsNullOrWhiteSpace(GeminiKeyBox.Password) && !IsValidApiKeyFormat(GeminiKeyBox.Password))
                validationErrors.Add("Gemini key format is invalid");
            if (!string.IsNullOrWhiteSpace(GroqKeyBox.Password) && !IsValidApiKeyFormat(GroqKeyBox.Password))
                validationErrors.Add("Groq key format is invalid");
            if (!string.IsNullOrWhiteSpace(OpenRouterKeyBox.Password) && !IsValidApiKeyFormat(OpenRouterKeyBox.Password))
                validationErrors.Add("OpenRouter key format is invalid");
            if (!string.IsNullOrWhiteSpace(MistralKeyBox.Password) && !IsValidApiKeyFormat(MistralKeyBox.Password))
                validationErrors.Add("Mistral key format is invalid");
            if (!string.IsNullOrWhiteSpace(CerebrasKeyBox.Password) && !IsValidApiKeyFormat(CerebrasKeyBox.Password))
                validationErrors.Add("Cerebras key format is invalid");
            if (!string.IsNullOrWhiteSpace(TogetherKeyBox.Password) && !IsValidApiKeyFormat(TogetherKeyBox.Password))
                validationErrors.Add("Together key format is invalid");
            if (!string.IsNullOrWhiteSpace(CohereKeyBox.Password) && !IsValidApiKeyFormat(CohereKeyBox.Password))
                validationErrors.Add("Cohere key format is invalid");
            if (!string.IsNullOrWhiteSpace(DeepSeekKeyBox.Password) && !IsValidApiKeyFormat(DeepSeekKeyBox.Password))
                validationErrors.Add("DeepSeek key format is invalid");

            if (validationErrors.Count > 0)
            {
                StatusMessage.Text = $"Validation errors: {string.Join(", ", validationErrors)}";
                return;
            }

            // Validate & save Gemini key if provided
            if (!string.IsNullOrWhiteSpace(GeminiKeyBox.Password))
            {
                SecureStorage.SaveSecureValue("API_KEY_GEMINI", GeminiKeyBox.Password.Trim());
            }

            if (!string.IsNullOrWhiteSpace(GroqKeyBox.Password))
                SecureStorage.SaveSecureValue("API_KEY_GROQ", GroqKeyBox.Password.Trim());
            if (!string.IsNullOrWhiteSpace(OpenRouterKeyBox.Password))
                SecureStorage.SaveSecureValue("API_KEY_OPENROUTER", OpenRouterKeyBox.Password.Trim());
            if (!string.IsNullOrWhiteSpace(MistralKeyBox.Password))
                SecureStorage.SaveSecureValue("API_KEY_MISTRAL", MistralKeyBox.Password.Trim());
            if (!string.IsNullOrWhiteSpace(CerebrasKeyBox.Password))
                SecureStorage.SaveSecureValue("API_KEY_CEREBRAS", CerebrasKeyBox.Password.Trim());
            if (!string.IsNullOrWhiteSpace(TogetherKeyBox.Password))
                SecureStorage.SaveSecureValue("API_KEY_TOGETHER", TogetherKeyBox.Password.Trim());
            if (!string.IsNullOrWhiteSpace(CohereKeyBox.Password))
                SecureStorage.SaveSecureValue("API_KEY_COHERE", CohereKeyBox.Password.Trim());
            if (!string.IsNullOrWhiteSpace(DeepSeekKeyBox.Password))
                SecureStorage.SaveSecureValue("API_KEY_DEEPSEEK", DeepSeekKeyBox.Password.Trim());

            SecureStorage.SaveSecureValue("BRAIN_WS_URL", BrainUrlBox.Text.Trim());
            SecureStorage.SaveSecureValue("ENABLE_CAMERA_TRACKING", EnableCameraTracking ? "true" : "false");
            SecureStorage.SaveSecureValue("ENABLE_CONTINUOUS_STT", EnableContinuousStt ? "true" : "false");
            SecureStorage.SaveSecureValue("ENABLE_SCREEN_GUARD", EnableScreenGuard ? "true" : "false");
            SecureStorage.SaveSecureValue("ENABLE_AUTO_RECONNECT", EnableAutoReconnect ? "true" : "false");
            SecureStorage.SaveSecureValue("SPEECH_LANGUAGE", SelectedLanguage);
            SecureStorage.SaveSecureValue("DOOMSCROLL_MINUTES", DoomscrollMinutes.ToString());
            SecureStorage.SaveSecureValue("RETRY_TIMEOUT_SECONDS", RetryTimeoutSeconds.ToString());

            DialogResult = true;
            Close();
        }
        catch (Exception ex)
        {
            StatusMessage.Text = $"Error saving settings: {ex.Message}";
        }
    }

    private static bool IsValidApiKeyFormat(string key)
    {
        if (string.IsNullOrWhiteSpace(key)) return false;
        var trimmed = key.Trim();
        return trimmed.Length >= 20 && (trimmed.Contains("-") || trimmed.Contains("_") || trimmed.Length >= 32);
    }

    private void CancelButton_Click(object sender, RoutedEventArgs e)
    {
        DialogResult = false;
        Close();
    }

    private static bool LoadBool(string key, bool fallback)
    {
        var value = SecureStorage.LoadSecureValue(key);
        return bool.TryParse(value, out var parsed) ? parsed : fallback;
    }
}
