# Generates assets/marctap.ico (256px, PNG-compressed ICO) for the MTap desktop shortcut.
# v2 design: lit glass globe with land shapes, bold M monogram, planted red pin.
# ASCII-only file (PS 5.1 safe).
Add-Type -AssemblyName System.Drawing

$size = 256
$bmp = New-Object System.Drawing.Bitmap($size, $size)
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.SmoothingMode = 'AntiAlias'
$g.TextRenderingHint = 'AntiAliasGridFit'
$g.Clear([System.Drawing.Color]::Transparent)

# --- soft outer glow ---
for ($i = 0; $i -lt 5; $i++) {
    $alpha = 26 - ($i * 5)
    $pad = 2 + $i * 2
    $glowPen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb($alpha, 90, 160, 255), 6)
    $g.DrawEllipse($glowPen, $pad, $pad, $size - 2 * $pad, $size - 2 * $pad)
    $glowPen.Dispose()
}

# --- sphere with off-center radial light (3D look) ---
$spherePath = New-Object System.Drawing.Drawing2D.GraphicsPath
$spherePath.AddEllipse(16, 16, 224, 224)
$sphereBrush = New-Object System.Drawing.Drawing2D.PathGradientBrush($spherePath)
$sphereBrush.CenterPoint = New-Object System.Drawing.PointF(95, 85)
$sphereBrush.CenterColor = [System.Drawing.Color]::FromArgb(255, 92, 160, 250)
$sphereBrush.SurroundColors = @([System.Drawing.Color]::FromArgb(255, 10, 28, 74))
$g.FillPath($sphereBrush, $spherePath)

# --- stylized land (two tones for depth) ---
$clip = New-Object System.Drawing.Drawing2D.GraphicsPath
$clip.AddEllipse(16, 16, 224, 224)
$g.SetClip($clip)

$landDark = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 42, 150, 92))
$landLite = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 84, 200, 128))

# americas sweep (left)
$p1 = New-Object System.Drawing.Drawing2D.GraphicsPath
$p1.AddClosedCurve(@(
    (New-Object System.Drawing.PointF(52, 62)),
    (New-Object System.Drawing.PointF(96, 52)),
    (New-Object System.Drawing.PointF(112, 84)),
    (New-Object System.Drawing.PointF(88, 112)),
    (New-Object System.Drawing.PointF(96, 158)),
    (New-Object System.Drawing.PointF(76, 196)),
    (New-Object System.Drawing.PointF(56, 160)),
    (New-Object System.Drawing.PointF(40, 110))
), 0.6)
$g.FillPath($landLite, $p1)

# eurasia-africa sweep (right)
$p2 = New-Object System.Drawing.Drawing2D.GraphicsPath
$p2.AddClosedCurve(@(
    (New-Object System.Drawing.PointF(150, 46)),
    (New-Object System.Drawing.PointF(206, 62)),
    (New-Object System.Drawing.PointF(226, 104)),
    (New-Object System.Drawing.PointF(196, 128)),
    (New-Object System.Drawing.PointF(206, 172)),
    (New-Object System.Drawing.PointF(174, 198)),
    (New-Object System.Drawing.PointF(152, 152)),
    (New-Object System.Drawing.PointF(136, 96))
), 0.6)
$g.FillPath($landDark, $p2)

# polar cap
$capBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(220, 235, 246, 255))
$g.FillEllipse($capBrush, 92, 8, 110, 40)

# --- glossy highlight across the top ---
$glossPath = New-Object System.Drawing.Drawing2D.GraphicsPath
$glossPath.AddEllipse(34, 22, 190, 110)
$glossBrush = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
    (New-Object System.Drawing.Point(0, 20)),
    (New-Object System.Drawing.Point(0, 135)),
    [System.Drawing.Color]::FromArgb(120, 255, 255, 255),
    [System.Drawing.Color]::FromArgb(0, 255, 255, 255))
$g.FillPath($glossBrush, $glossPath)
$g.ResetClip()

# --- bold M monogram with shadow ---
$fmt = New-Object System.Drawing.StringFormat
$fmt.Alignment = 'Center'
$fmt.LineAlignment = 'Center'
$font = New-Object System.Drawing.Font('Segoe UI Black', 108, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
$shadowBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(150, 4, 12, 34))
$textBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::White)
$rectShadow = New-Object System.Drawing.RectangleF(4, 44, 256, 200)
$rectText = New-Object System.Drawing.RectangleF(0, 38, 256, 200)
$g.DrawString('M', $font, $shadowBrush, $rectShadow, $fmt)
$g.DrawString('M', $font, $textBrush, $rectText, $fmt)

# --- red pin planted top-right ---
$pinShadow = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(90, 0, 0, 0))
$g.FillEllipse($pinShadow, 168, 84, 34, 12)
$pinBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 255, 71, 100))
$pinPts = @(
    (New-Object System.Drawing.PointF(185, 92)),
    (New-Object System.Drawing.PointF(167, 48)),
    (New-Object System.Drawing.PointF(203, 48))
)
$g.FillPolygon($pinBrush, $pinPts)
$g.FillEllipse($pinBrush, 163, 12, 44, 44)
$pinDot = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::White)
$g.FillEllipse($pinDot, 177, 26, 16, 16)

# --- crisp rim ---
$rimPen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(235, 150, 200, 255), 5)
$g.DrawEllipse($rimPen, 16, 16, 224, 224)

$g.Dispose()

$ms = New-Object System.IO.MemoryStream
$bmp.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png)
$png = $ms.ToArray()

$outDir = Join-Path (Split-Path -Parent $PSScriptRoot) "assets"
New-Item -ItemType Directory -Force $outDir | Out-Null
$icoPath = Join-Path $outDir "marctap.ico"

$fs = [System.IO.File]::Create($icoPath)
$bw = New-Object System.IO.BinaryWriter($fs)
$bw.Write([UInt16]0); $bw.Write([UInt16]1); $bw.Write([UInt16]1)
$bw.Write([Byte]0); $bw.Write([Byte]0)
$bw.Write([Byte]0); $bw.Write([Byte]0)
$bw.Write([UInt16]1); $bw.Write([UInt16]32)
$bw.Write([UInt32]$png.Length); $bw.Write([UInt32]22)
$bw.Write($png)
$bw.Close(); $fs.Close()

# Also save a PNG preview for quick visual checks
$pngPath = Join-Path $outDir "icon-preview.png"
[System.IO.File]::WriteAllBytes($pngPath, $png)

Write-Output ("icon written: " + $icoPath + " (" + (Get-Item $icoPath).Length + " bytes)")
