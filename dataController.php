<?php
require_once "helper.php";

header("Content-Type: application/json; charset=utf-8");
header("Cache-Control: no-store, no-cache, must-revalidate, max-age=0");
header("Pragma: no-cache");
header("Expires: 0");

// Limits
$dailyCreateLimit = 300;
$dailyUpdateLimit = 10000 * 86400;
$dailySharedNoteLimit = 1000;

// Parse JSON body
$rawJson = file_get_contents("php://input");
$json = json_decode($rawJson, true);

// For simulating real world server. REMOVE!!
// usleep(800000); // 0.8 seconds

if (!is_array($json)) {
    echo json_encode(["error" => "invalid_json"]);
    exit();
}

// CSRF
$csrf = isset($json["csrf_token"]) ? filter_var($json["csrf_token"], FILTER_SANITIZE_FULL_SPECIAL_CHARS) : "";

if (!checkCSRF($csrf)) {
    echo json_encode(["error" => true]);
    accesslog("failedCSRF");
    exit();
}

// Action
$action = isset($json["action"]) ? filter_var($json["action"], FILTER_SANITIZE_FULL_SPECIAL_CHARS) : "";

// Base path for libraries
$basePath = $_SERVER["DOCUMENT_ROOT"] . "/userdata/libraries/";
if (!is_dir($basePath)) {
    mkdir($basePath, 0755, true);
}

/**
 * Validate encryption key against stored data.
 * Returns true if decryption and JSON decode succeed, false otherwise.
 */
function isCorrectKey(string $encryptedData, string $key): bool
{
    $decrypted = decrypt($encryptedData, $key);
    if ($decrypted === false || $decrypted === "") {
        return false;
    }
    json_decode($decrypted, true);
    return json_last_error() === JSON_ERROR_NONE;
}

/**
 * Merge notes: local (client) & remote (server)
 * - Per-note lastModified rule
 * - Union of keys from both sides
 */
function mergeNotes(array $local, array $remote): array
{
    $fullMerge = [];
    $sparseMerge = [];
    $keys = array_unique(array_merge(array_keys($local), array_keys($remote)));
    foreach ($keys as $key) {
        $v1 = $local[$key] ?? null; // client
        $v2 = $remote[$key] ?? null; // server
        if ($v1 !== null && $v2 !== null) {
            $t1 = isset($v1["lastModified"]) ? (int) $v1["lastModified"] : 0;
            $t2 = isset($v2["lastModified"]) ? (int) $v2["lastModified"] : 0;
            $newer = $t1 >= $t2 ? $v1 : $v2;
        } else {
            $newer = $v1 ?? $v2;
        }

        // If deleted, drop it after all clients had a chance to sync
        if (($newer["parentId"] ?? 0) === "trash") {
            $ttl = 7 * 24 * 60 * 60 * 1000; // 7 days
            $lastModified = $newer["lastModified"] ?? 0;
            $age = time() * 1000 - $lastModified;
            if ($age > $ttl) {
                continue;
            }
        }
        $fullMerge[$key] = $newer;
        if ($newer != $v1) {
            $sparseMerge[$key] = $newer;
        }
    }
    return [$fullMerge, $sparseMerge];
}

/* ============================================================
 * READ
 * ========================================================== */
if ($action === "read") {
    $id = isset($json["id"]) ? filter_var($json["id"], FILTER_SANITIZE_FULL_SPECIAL_CHARS) : "";
    $key = isset($json["key"]) ? filter_var($json["key"], FILTER_SANITIZE_FULL_SPECIAL_CHARS) : "";

    $file = $basePath . $id;

    if (!file_exists($file)) {
        accesslog("readUnknownFile");
        echo json_encode(["error" => true]);
        exit();
    }

    $fileContent = file_get_contents($file);

    if (!isCorrectKey($fileContent, $key)) {
        accesslog("invalidKey");
        echo json_encode(["error" => "invalidkey"]);
        exit();
    }

    $decrypted = decrypt($fileContent, $key);
    $obj = json_decode($decrypted, true);

    if (!is_array($obj)) {
        // if something went wrong, return empty structure instead of crashing
        $obj = [];
    }

    accesslog("read");
    echo json_encode($obj);
    exit();
}

/* ============================================================
 * UPLOAD & MERGE
 * ========================================================== */
if ($action === "uploadAndMerge") {
    $id = isset($json["id"]) ? filter_var($json["id"], FILTER_SANITIZE_FULL_SPECIAL_CHARS) : "";
    $key = isset($json["key"]) ? filter_var($json["key"], FILTER_SANITIZE_FULL_SPECIAL_CHARS) : "";

    // Incoming notes from client
    $body = $json["body"] ?? [];
    if (!is_array($body)) {
        $body = [];
    }

    $file = $basePath . $id;

    if (file_exists($file)) {
        // UPDATE PATH: merge with existing data
        $ogDataEncrypted = file_get_contents($file);

        if (!isCorrectKey($ogDataEncrypted, $key)) {
            accesslog("invalidKey");
            echo json_encode(["error" => "invalidkey"]);
            exit();
        }

        // Check update limit
        $count = accesslog("update", false);
        if ($count >= $dailyUpdateLimit) {
            accesslog("exceededDailyUpdateLimit");
            echo json_encode(["error" => "limit"]);
            exit();
        }
        accesslog("update");

        $ogDataDecrypted = decrypt($ogDataEncrypted, $key);
        $ogData = json_decode($ogDataDecrypted, true);

        if (!is_array($ogData)) {
            $ogData = [];
        }

        // SERVER-SIDE MERGE: client body + existing server data
        $merged = mergeNotes($body, $ogData);
    } else {
        // CREATE PATH: new file
        $count = accesslog("create", false);
        if ($count >= $dailyCreateLimit) {
            accesslog("exceededDailyCreateLimit");
            echo json_encode(["error" => "limit"]);
            exit();
        }
        accesslog("create");

        // No previous data -> merged is just incoming body
        $merged = [$body, $body];
    }

    // Store merged result (JSON) encrypted with key
    $encrypted = encrypt(json_encode($merged[0]), $key);
    file_put_contents($file, $encrypted);

    // Return merged state so client can update its local notes
    echo json_encode([
        "success" => true,
        "body" => $merged[1],
    ]);
    exit();
}

/* ============================================================
 * CREATE SHARED NOTE
 * ========================================================== */
if ($action === "createSharedNote") {
    $count = accesslog("createSharedNote", false);
    if ($count >= $dailySharedNoteLimit) {
        accesslog("exceededDailyCreateSharedLimit");
        echo json_encode(["error" => "limit"]);
        exit();
    }

    $id = isset($json["id"]) ? filter_var($json["id"], FILTER_SANITIZE_FULL_SPECIAL_CHARS) : "";
    $key = isset($json["key"]) ? filter_var($json["key"], FILTER_SANITIZE_FULL_SPECIAL_CHARS) : "";
    $content = $json["content"] ?? [];

    $file = $_SERVER["DOCUMENT_ROOT"] . "/userdata/sharedNotes/" . $id;
    if (file_exists($file)) {
        echo json_encode(["error" => "exists"]);
        exit();
    }

    $encryptedContent = encrypt(json_encode($content), $key);
    file_put_contents($file, $encryptedContent);

    echo json_encode([
        "success" => true,
        "id" => $id,
        "key" => $key,
    ]);
    exit();
}

if ($action === "getSharedNote") {
    $id = isset($json["id"]) ? filter_var($json["id"], FILTER_SANITIZE_FULL_SPECIAL_CHARS) : "";
    $key = isset($json["key"]) ? filter_var($json["key"], FILTER_SANITIZE_FULL_SPECIAL_CHARS) : "";

    $file = $_SERVER["DOCUMENT_ROOT"] . "/userdata/sharedNotes/" . $id;
    if (!file_exists($file)) {
        echo json_encode(["error" => "does not exist"]);
        exit();
    }

    $content = file_get_contents($file);
    $decrypted = decrypt($content, $key);
    if ($decrypted === false || $decrypted === "") {
        echo json_encode(["error" => "invalidkey"]);
        exit();
    }

    $obj = json_decode($decrypted, true);
    echo json_encode([
        "success" => true,
        "body" => $obj,
    ]);
    exit();
}

/* ============================================================
 * CLEANUP TASK (probabilistic)
 * ========================================================== */
if (mt_rand(1, 10) === 1) {
    $files = glob($_SERVER["DOCUMENT_ROOT"] . "/userdata/*");
    $numberOfFilesToCheck = 10;
    $fileCount = is_array($files) ? count($files) : 0;

    if ($fileCount > 0) {
        for ($i = 0; $i < $numberOfFilesToCheck; $i++) {
            $randomIndex = mt_rand(0, $fileCount - 1);
            $file = $files[$randomIndex] ?? null;

            if (!$file || !file_exists($file)) {
                continue;
            }

            // Delete file if not accessed in over 24 months
            $timeDifference = time() - @fileatime($file);
            if ($timeDifference > 24 * (30 * 24 * 60 * 60)) {
                accesslog("cleanUp");
                @unlink($file);
            }
        }
    }
}

// If we got here, action was unknown
echo json_encode(["error" => "unknown_action"]);
exit();
