Add-Type -AssemblyName System.Drawing
function Make-Fixture($filename,$title,$lines,$background,$foreground,$accent){
  $image=New-Object System.Drawing.Bitmap 1600,900
  $graphics=[System.Drawing.Graphics]::FromImage($image)
  $graphics.Clear([System.Drawing.ColorTranslator]::FromHtml($background))
  $graphics.TextRenderingHint=[System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit
  $font=New-Object System.Drawing.Font('Consolas',20,[System.Drawing.FontStyle]::Regular)
  $heading=New-Object System.Drawing.Font('Arial',17,[System.Drawing.FontStyle]::Bold)
  $textBrush=New-Object System.Drawing.SolidBrush ([System.Drawing.ColorTranslator]::FromHtml($foreground))
  $accentBrush=New-Object System.Drawing.SolidBrush ([System.Drawing.ColorTranslator]::FromHtml($accent))
  $graphics.DrawString($title,$heading,$accentBrush,48,28)
  $y=104
  foreach($line in $lines){$graphics.DrawString($line,$font,$textBrush,70,$y);$y+=87}
  $image.Save((Join-Path (Get-Location) $filename),[System.Drawing.Imaging.ImageFormat]::Png)
  $graphics.Dispose();$image.Dispose();$font.Dispose();$heading.Dispose();$textBrush.Dispose();$accentBrush.Dispose()
}
Make-Fixture 'public/fixtures/fake-vscode-dark.png' 'FAKE TEST DATA - editor sample' @(
  'CUSTOMER_EMAIL=ananya.demo@example.com',
  'CUSTOMER_PHONE=+91 9123456789',
  'API_KEY=sk_test_safeshare_8H2K9M4P7Q',
  'ACCESS_TOKEN=tok_demo_72KLM91XYZ',
  'DATABASE_URL=postgresql://demo_user:FakePass123@192.168.1.44:5432/demo',
  'INTERNAL_API=http://192.168.1.25:8080/admin',
  'PUBLIC_SITE=https://example.com',
  'PASSWORD=DemoPassword_987'
) '#1e1e1e' '#d4d4d4' '#4ec9b0'
Make-Fixture 'public/fixtures/fake-terminal-dark.png' 'FAKE TEST DATA - terminal sample' @(
  'AWS_ACCESS_KEY_ID=AKIAFAKESAFESHARE123',
  'API_TOKEN=ghp_FAKE_SAFESHARE_TOKEN_123456',
  'Authorization: Bearer fake_token_987654',
  'http://10.0.0.25/api/users',
  'Host: 10.0.0.15',
  'User: demo_admin',
  'Password: FakeTerminalPass123',
  'Customer email: customer.demo@example.com'
) '#111827' '#e5e7eb' '#38bdf8'
