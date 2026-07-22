# Generates assets/marctap.ico (256px, PNG-compressed ICO) for the desktop shortcut.
# ASCII-only file (PS 5.1 safe).
Add-Type -AssemblyName System.Drawing

$size = 256
$bmp = New-Object System.Drawing.Bitmap($size, $size)
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.SmoothingMode = 'AntiAlias'
$g.Clear([System.Drawing.Color]::Transparent)

# Ocean sphere with a vertical gradient
$oceanBrush = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
    (New-Object System.Drawing.Point(0, 0)),
    (New-Object System.Drawing.Point(0, $size)),
    [System.Drawing.Color]::FromArgb(255, 59, 130, 246),
    [System.Drawing.Color]::FromArgb(255, 12, 42, 102))
$g.FillEllipse($oceanBrush, 8, 8, 240, 240)

# Stylized land masses
$land = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 74, 222, 128))
$g.FillEllipse($land, 34, 78, 78, 64)    # americas-ish
$g.FillEllipse($land, 150, 44, 72, 48)   # eurasia-ish
$g.FillEllipse($land, 138, 118, 56, 68)  # africa-ish
$g.FillEllipse($land, 196, 178, 34, 26)  # oceania-ish
$g.FillEllipse($land, 60, 178, 44, 30)   # s. america-ish

# Red map pin (the MarcTap mark)
$pin = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 255, 77, 109))
$pts = @(
    (New-Object System.Drawing.PointF(128, 158)),
    (New-Object System.Drawing.PointF(101, 98)),
    (New-Object System.Drawing.PointF(155, 98))
)
$g.FillPolygon($pin, $pts)
$g.FillEllipse($pin, 94, 44, 68, 68)
$white = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::White)
$g.FillEllipse($white, 115, 65, 26, 26)

# Atmosphere rim
$rimPen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(210, 147, 197, 253), 8)
$g.DrawEllipse($rimPen, 8, 8, 240, 240)
$g.Dispose()

$ms = New-Object System.IO.MemoryStream
$bmp.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png)
$png = $ms.ToArray()

$outDir = Join-Path (Split-Path -Parent $PSScriptRoot) "assets"
New-Item -ItemType Directory -Force $outDir | Out-Null
$icoPath = Join-Path $outDir "marctap.ico"

# ICO container with a single PNG-compressed 256px entry (valid since Vista)
$fs = [System.IO.File]::Create($icoPath)
$bw = New-Object System.IO.BinaryWriter($fs)
$bw.Write([UInt16]0); $bw.Write([UInt16]1); $bw.Write([UInt16]1)  # ICONDIR: reserved, type=icon, count=1
$bw.Write([Byte]0)                                               # width 256 encodes as 0
$bw.Write([Byte]0)                                               # height 256 encodes as 0
$bw.Write([Byte]0); $bw.Write([Byte]0)                           # palette, reserved
$bw.Write([UInt16]1); $bw.Write([UInt16]32)                      # planes, bpp
$bw.Write([UInt32]$png.Length); $bw.Write([UInt32]22)            # data size, offset
$bw.Write($png)
$bw.Close(); $fs.Close()

Write-Output ("icon written: " + $icoPath + " (" + (Get-Item $icoPath).Length + " bytes)")
