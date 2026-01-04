using System.Windows;
using System.Windows.Input;
using System.Windows.Media.Imaging;
using System;

namespace JubileeBrowser;

public partial class AboutWindow : Window
{
    public AboutWindow()
    {
        InitializeComponent();

        // Set version
        var version = typeof(MainWindow).Assembly.GetName().Version;
        VersionText.Text = $"Version {version?.Major}.{version?.Minor}.{version?.Build}";

        // Load high-quality logo from embedded resources
        try
        {
            var logoImage = new BitmapImage();
            logoImage.BeginInit();
            logoImage.UriSource = new Uri("pack://application:,,,/Resources/Icons/jubilee-logo.png", UriKind.Absolute);
            logoImage.DecodePixelWidth = 172; // 2x the display size (86px) for high-DPI clarity
            logoImage.CacheOption = BitmapCacheOption.OnLoad;
            logoImage.EndInit();
            logoImage.Freeze(); // Make thread-safe and improve performance

            AvatarImageBrush.ImageSource = logoImage;
        }
        catch
        {
            // Logo not found, leave empty
        }
    }

    private void TitleBar_MouseLeftButtonDown(object sender, MouseButtonEventArgs e)
    {
        if (e.ClickCount == 1)
        {
            DragMove();
        }
    }

    private void CloseButton_Click(object sender, RoutedEventArgs e)
    {
        Close();
    }

    private void OkButton_Click(object sender, RoutedEventArgs e)
    {
        Close();
    }
}
