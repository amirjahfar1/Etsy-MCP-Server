<?php
// Etsy OAuth catcher: displays "<state> <code>" for pasting into oauth-setup.js --complete=
$state = isset($_GET['state']) ? $_GET['state'] : '';
$code  = isset($_GET['code']) ? $_GET['code'] : '';
$error = isset($_GET['error']) ? $_GET['error'] : '';
$errorDesc = isset($_GET['error_description']) ? $_GET['error_description'] : '';

function h($s) { return htmlspecialchars($s, ENT_QUOTES, 'UTF-8'); }
$line = trim($state . ' ' . $code);
?>
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>Etsy Authorization</title>
<style>
  body { font-family: system-ui, sans-serif; max-width: 760px; margin: 60px auto; padding: 0 16px; color: #222; }
  code, textarea { font-family: ui-monospace, Consolas, monospace; }
  textarea { width: 100%; height: 90px; padding: 10px; font-size: 14px; box-sizing: border-box; }
  button { margin-top: 10px; padding: 8px 16px; font-size: 14px; cursor: pointer; }
  .err { color: #b00020; }
</style>
</head>
<body>
<?php if ($error): ?>
  <h2 class="err">Authorization failed</h2>
  <p><code><?php echo h($error); ?></code> <?php echo h($errorDesc); ?></p>
<?php elseif ($code && $state): ?>
  <h2>Authorization successful</h2>
  <p>Copy this line and paste it back to Claude:</p>
  <textarea id="line" readonly onclick="this.select()"><?php echo h($line); ?></textarea>
  <br><button onclick="navigator.clipboard.writeText(document.getElementById('line').value)">Copy</button>
<?php else: ?>
  <h2>Nothing to show</h2>
  <p>No <code>code</code>/<code>state</code> received. Start the authorization from the link Claude gave you.</p>
<?php endif; ?>
</body>
</html>
