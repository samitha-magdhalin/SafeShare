Add-Type -AssemblyName System.Drawing
$image = New-Object System.Drawing.Bitmap 1200, 750
$graphics = [System.Drawing.Graphics]::FromImage($image)
$graphics.Clear([System.Drawing.Color]::FromArgb(247,250,249))
$graphics.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit
$heading = New-Object System.Drawing.Font('Arial',26,[System.Drawing.FontStyle]::Bold)
$body = New-Object System.Drawing.Font('Arial',24,[System.Drawing.FontStyle]::Regular)
$muted = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(38,61,70))
$accent = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(29,113,105))
$graphics.DrawString('FAKE TEST DATA - Developer Debug Screen',$heading,$accent,50,43)
$lines = @(
  'Customer: demo.user@example.com',
  'Phone: +91 9876543210',
  'Internal Server: http://192.168.1.25/admin',
  'API_KEY=sk_test_FAKE_SAFE_SHARE_123456',
  'PASSWORD=DemoPassword_NotReal_123'
)
$y = 140
foreach($line in $lines){ $graphics.DrawString($line,$body,$muted,56,$y); $y += 94 }
$graphics.DrawString('All values on this screen are synthetic and intentionally fake.',$body,$accent,56,650)
$image.Save((Join-Path (Get-Location) 'public/fixtures/fake-debug-screen.png'),[System.Drawing.Imaging.ImageFormat]::Png)
$graphics.Dispose();$image.Dispose();$heading.Dispose();$body.Dispose();$muted.Dispose();$accent.Dispose()

