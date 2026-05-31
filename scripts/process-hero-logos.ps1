# Copy seasonal hero logos and remove near-white backgrounds.
$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Drawing

$root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path

$cursorAssets = Join-Path $env:USERPROFILE ".cursor\projects\c-Users-mdipietr-Documents-Projects-Escape-DT-Escape-DT\assets"
$outDir = Join-Path $root "assets\hero"
New-Item -ItemType Directory -Force -Path $outDir | Out-Null

$sources = @{
  "shy-winter.png" = "c__Users_mdipietr_AppData_Roaming_Cursor_User_workspaceStorage_empty-window_images_ShyWinter-9999d5b5-f35e-4ca7-b771-f4a8e7a133dc.png"
  "shy-spring.png" = "c__Users_mdipietr_AppData_Roaming_Cursor_User_workspaceStorage_empty-window_images_ShySpring-3b324f01-8629-44c5-8706-b3ccfaa0bb38.png"
  "shy-summer.png" = "c__Users_mdipietr_AppData_Roaming_Cursor_User_workspaceStorage_empty-window_images_ShySummer-0c663b05-f126-40e8-ab6a-fcfa356f61a1.png"
  "shy-fall.png"   = "c__Users_mdipietr_AppData_Roaming_Cursor_User_workspaceStorage_empty-window_images_Shy_Fall-655d40ac-7c97-42f6-9355-3c5deb8bbf93.png"
}

function Remove-WhiteBackground {
  param([System.Drawing.Bitmap]$bmp, [int]$threshold = 248)
  $bmp.MakeTransparent()
  for ($y = 0; $y -lt $bmp.Height; $y++) {
    for ($x = 0; $x -lt $bmp.Width; $x++) {
      $c = $bmp.GetPixel($x, $y)
      $min = [Math]::Min($c.R, [Math]::Min($c.G, $c.B))
      $spread = ([Math]::Max($c.R, [Math]::Max($c.G, $c.B)) - $min)
      if ($min -ge $threshold -and $spread -le 28) {
        $bmp.SetPixel($x, $y, [System.Drawing.Color]::FromArgb(0, $c.R, $c.G, $c.B))
      }
    }
  }
}

foreach ($pair in $sources.GetEnumerator()) {
  $src = Join-Path $cursorAssets $pair.Value
  if (-not (Test-Path $src)) { throw "Missing source: $src" }
  $img = [System.Drawing.Image]::FromFile($src)
  $bmp = New-Object System.Drawing.Bitmap $img.Width, $img.Height, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.Clear([System.Drawing.Color]::Transparent)
  $g.DrawImage($img, 0, 0, $img.Width, $img.Height)
  $g.Dispose()
  $img.Dispose()
  Remove-WhiteBackground -bmp $bmp
  $dest = Join-Path $outDir $pair.Key
  $bmp.Save($dest, [System.Drawing.Imaging.ImageFormat]::Png)
  $bmp.Dispose()
  Write-Host "Wrote $dest"
}
