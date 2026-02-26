<?php
require_once "helper.php";
createCSRF();

// Serve Frontend
readfile(__DIR__ . "/frontend/main.html");
readfile(__DIR__ . "/frontend/dialogs.html");

// Generate Keys for signing
if (!file_exists("keys/public.key.raw") || !file_exists("keys/private.key.raw")) {
    $keypair = sodium_crypto_sign_keypair();
    $publicKey = sodium_crypto_sign_publickey($keypair);
    $secretKey = sodium_crypto_sign_secretkey($keypair);
    file_put_contents("keys/public.key.raw", $publicKey);
    file_put_contents("keys/private.key.raw", $secretKey);
}
$publicKey = base64_encode(file_get_contents("keys/public.key.raw"));
echo "<script>const publicKey = '" . $publicKey . "';</script>";

// Signing TEST
$sig = createSignature("account_123");
echo "<script>const signature = '" . $sig . "';</script>";

function createSignature($payload)
{
    $privateKey = base64_encode(file_get_contents("keys/private.key.raw"));
    $secretKey = base64_decode($privateKey, true);
    $sig = sodium_crypto_sign_detached($payload, $secretKey);
    $res = base64_encode($payload) . "." . base64_encode($sig);
    return $res;
}

// JS to verify this signature (tested, seems to work)
/*

const publicKeyBase64 = "PUT_PUBLIC_B64_HERE";

async function importEd25519PublicKey() {
  const raw = Uint8Array.from(atob(publicKeyBase64), c => c.charCodeAt(0));
  return crypto.subtle.importKey("raw", raw, { name: "Ed25519" }, false, ["verify"]);
}

async function isValidKey(key, accountId) {
  const [payloadB64, sigB64] = key.split(".");
  if (!payloadB64 || !sigB64) return false;

  const payload = atob(payloadB64);
  if (payload !== accountId) return false;

  const message = new TextEncoder().encode(payload);
  const signature = Uint8Array.from(atob(sigB64), c => c.charCodeAt(0));

  const pub = await importEd25519PublicKey();
  return crypto.subtle.verify("Ed25519", pub, signature, message);
}

*/

?>
