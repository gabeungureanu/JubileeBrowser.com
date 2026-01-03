using System.Runtime.InteropServices;
using System.Security.Cryptography.X509Certificates;

namespace JubileeBrowser.UpdateAgent;

public static class AuthenticodeVerifier
{
    private static readonly Guid WinTrustActionGenericVerifyV2 = new("00AAC56B-CD44-11d0-8CC2-00C04FC295EE");

    public static bool Verify(string filePath, string expectedThumbprint)
    {
        if (!VerifySignature(filePath))
        {
            return false;
        }

        try
        {
            var cert = new X509Certificate2(X509Certificate.CreateFromSignedFile(filePath));
            var thumbprint = NormalizeThumbprint(cert.Thumbprint);
            var expected = NormalizeThumbprint(expectedThumbprint);
            return string.Equals(thumbprint, expected, StringComparison.OrdinalIgnoreCase);
        }
        catch
        {
            return false;
        }
    }

    private static bool VerifySignature(string filePath)
    {
        using var fileInfo = new WinTrustFileInfo(filePath);
        using var trustData = new WinTrustData(fileInfo);
        var result = WinVerifyTrust(IntPtr.Zero, WinTrustActionGenericVerifyV2, trustData.Pointer);
        return result == 0;
    }

    private static string NormalizeThumbprint(string? thumbprint)
    {
        return string.IsNullOrWhiteSpace(thumbprint)
            ? string.Empty
            : thumbprint.Replace(" ", string.Empty).Trim();
    }

    [DllImport("wintrust.dll", ExactSpelling = true, SetLastError = true)]
    private static extern uint WinVerifyTrust(IntPtr hwnd, [MarshalAs(UnmanagedType.LPStruct)] Guid pgActionID, IntPtr pWVTData);

    private sealed class WinTrustFileInfo : IDisposable
    {
        public IntPtr Pointer { get; }

        public WinTrustFileInfo(string filePath)
        {
            var info = new WINTRUST_FILE_INFO
            {
                cbStruct = (uint)Marshal.SizeOf<WINTRUST_FILE_INFO>(),
                pcwszFilePath = filePath,
                hFile = IntPtr.Zero,
                pgKnownSubject = IntPtr.Zero
            };

            Pointer = Marshal.AllocHGlobal(Marshal.SizeOf<WINTRUST_FILE_INFO>());
            Marshal.StructureToPtr(info, Pointer, false);
        }

        public void Dispose()
        {
            Marshal.FreeHGlobal(Pointer);
        }
    }

    private sealed class WinTrustData : IDisposable
    {
        public IntPtr Pointer { get; }

        public WinTrustData(WinTrustFileInfo fileInfo)
        {
            var data = new WINTRUST_DATA
            {
                cbStruct = (uint)Marshal.SizeOf<WINTRUST_DATA>(),
                pPolicyCallbackData = IntPtr.Zero,
                pSIPClientData = IntPtr.Zero,
                dwUIChoice = WTD_UI_NONE,
                fdwRevocationChecks = WTD_REVOKE_NONE,
                dwUnionChoice = WTD_CHOICE_FILE,
                pFile = fileInfo.Pointer,
                dwStateAction = WTD_STATEACTION_IGNORE,
                hWVTStateData = IntPtr.Zero,
                pwszURLReference = IntPtr.Zero,
                dwProvFlags = WTD_CACHE_ONLY_URL_RETRIEVAL,
                dwUIContext = 0
            };

            Pointer = Marshal.AllocHGlobal(Marshal.SizeOf<WINTRUST_DATA>());
            Marshal.StructureToPtr(data, Pointer, false);
        }

        public void Dispose()
        {
            Marshal.FreeHGlobal(Pointer);
        }
    }

    private const uint WTD_UI_NONE = 2;
    private const uint WTD_REVOKE_NONE = 0;
    private const uint WTD_CHOICE_FILE = 1;
    private const uint WTD_STATEACTION_IGNORE = 0;
    private const uint WTD_CACHE_ONLY_URL_RETRIEVAL = 0x00000020;

    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    private struct WINTRUST_FILE_INFO
    {
        public uint cbStruct;
        public string pcwszFilePath;
        public IntPtr hFile;
        public IntPtr pgKnownSubject;
    }

    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    private struct WINTRUST_DATA
    {
        public uint cbStruct;
        public IntPtr pPolicyCallbackData;
        public IntPtr pSIPClientData;
        public uint dwUIChoice;
        public uint fdwRevocationChecks;
        public uint dwUnionChoice;
        public IntPtr pFile;
        public uint dwStateAction;
        public IntPtr hWVTStateData;
        public IntPtr pwszURLReference;
        public uint dwProvFlags;
        public uint dwUIContext;
    }
}
