using System.Security.Cryptography;

namespace JubileeBrowser.UpdateAgent;

public static class SignatureVerifier
{
    public static bool VerifySignature(byte[] hash, string signatureBase64, string publicKeyPem)
    {
        try
        {
            var signatureBytes = Convert.FromBase64String(signatureBase64);
            using var rsa = RSA.Create();
            rsa.ImportFromPem(publicKeyPem.AsSpan());
            return rsa.VerifyHash(hash, signatureBytes, HashAlgorithmName.SHA256, RSASignaturePadding.Pkcs1);
        }
        catch
        {
            return false;
        }
    }
}
