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

        // Try to load logo from website folder
        try
        {
            // Try website images folder first (relative to app directory)
            var appDir = AppDomain.CurrentDomain.BaseDirectory;
            var websiteDir = System.IO.Path.GetDirectoryName(System.IO.Path.GetDirectoryName(System.IO.Path.GetDirectoryName(System.IO.Path.GetDirectoryName(System.IO.Path.GetDirectoryName(appDir)))));
            var logoPath = System.IO.Path.Combine(websiteDir ?? "", "website", "images", "jubilee-logo.png");

            BitmapImage? logoImage = null;

            if (System.IO.File.Exists(logoPath))
            {
                logoImage = new BitmapImage(new Uri(logoPath, UriKind.Absolute));
            }
            else
            {
                // Fallback to icon.ico in Resources
                var iconPath = System.IO.Path.Combine(appDir, "Resources", "Icons", "icon.ico");
                if (System.IO.File.Exists(iconPath))
                {
                    logoImage = new BitmapImage(new Uri(iconPath, UriKind.Absolute));
                }
                else
                {
                    // Try pack URI for embedded resource
                    logoImage = new BitmapImage(new Uri("pack://application:,,,/Resources/Icons/icon.ico", UriKind.Absolute));
                }
            }

            if (logoImage != null)
            {
                AvatarImageBrush.ImageSource = logoImage;
            }
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
