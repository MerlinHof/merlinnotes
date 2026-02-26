<?php
if (session_status() == PHP_SESSION_NONE) {
    session_start();
}

function createCSRF()
{
    $csrf_token = bin2hex(random_bytes(32));
    if (!isset($_SESSION["csrf_tokens"])) {
        $_SESSION["csrf_tokens"] = [];
    }
    $_SESSION["csrf_tokens"][] = $csrf_token;
    if (count($_SESSION["csrf_tokens"]) > 600) {
        array_shift($_SESSION["csrf_tokens"]);
    }
    echo "<script>const csrf_token = '" . $csrf_token . "'</script>";
}

function checkCSRF($postToken)
{
    if (empty($postToken) || !in_array($postToken, $_SESSION["csrf_tokens"])) {
        return false;
    }
    return true;
}

// Logs interesting data to a log file
function accesslog($action, $write = true)
{
    $basePath = $_SERVER["DOCUMENT_ROOT"] . "/userdata/logs/";
    if (!is_dir($basePath)) {
        mkdir($basePath, 0755, true);
    }
    $currentDay = date("Y-m-d");
    $logFilePath = $basePath . $currentDay . ".json";

    // Create the log file if it does not exist
    if (file_exists($logFilePath)) {
        $logContent = file_get_contents($logFilePath);
        $logData = json_decode($logContent, true);
    } else {
        $logData = [];
    }

    // Increment the log counter for the specified action
    if (isset($logData[$action])) {
        $logData[$action]++;
    } else {
        $logData[$action] = 1;
    }

    // Write the updated log data back to the file
    if ($write) {
        file_put_contents($logFilePath, json_encode($logData));
    }
    return $logData[$action];
}

function encrypt($string, $key)
{
    $method = "AES-256-CBC";
    $iv = substr(hash("sha256", $key), 0, 16);
    return base64_encode(openssl_encrypt($string, $method, $key, 0, $iv));
}

function decrypt($encrypted, $key)
{
    $method = "AES-256-CBC";
    $iv = substr(hash("sha256", $key), 0, 16);
    return openssl_decrypt(base64_decode($encrypted), $method, $key, 0, $iv);
}

function randomString($length = 12)
{
    $letters = "abcdefghijklmnopqrstuvwxyz";
    $chars = "abcdefghijklmnopqrstuvwxyz0123456789";

    $result = "";

    for ($i = 0; $i < $length; $i++) {
        if ($i === 0) {
            // first char must be a letter
            $index = random_int(0, strlen($letters) - 1);
            $result .= $letters[$index];
        } else {
            // letters + digits
            $index = random_int(0, strlen($chars) - 1);
            $result .= $chars[$index];
        }
    }

    return $result;
}

?>
