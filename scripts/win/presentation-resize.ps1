Add-Type @"
using System;
using System.Runtime.InteropServices;
using System.Text;
using System.Collections.Generic;
public class Win32 {
    [DllImport("user32.dll")]
    public static extern bool SetWindowPos(IntPtr hWnd, IntPtr hWndInsertAfter, int X, int Y, int cx, int cy, uint uFlags);
    [DllImport("user32.dll")]
    public static extern bool EnumWindows(EnumWindowsProc lpEnumFunc, IntPtr lParam);
    [DllImport("user32.dll")]
    public static extern int GetWindowText(IntPtr hWnd, StringBuilder lpString, int nMaxCount);
    [DllImport("user32.dll")]
    public static extern bool IsWindowVisible(IntPtr hWnd);
    public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);
    public static List<IntPtr> GetWindowsByTitle(string contains) {
        var result = new List<IntPtr>();
        EnumWindows((h, l) => {
            if (IsWindowVisible(h)) {
                var sb = new StringBuilder(256);
                GetWindowText(h, sb, 256);
                if (sb.ToString().Contains(contains)) result.Add(h);
            }
            return true;
        }, IntPtr.Zero);
        return result;
    }
}
"@

$width  = 1360
$height = 1392

for ($i = 0; $i -lt 15; $i++) {
    Start-Sleep -Seconds 1
    $wins = [Win32]::GetWindowsByTitle("Presentation")
    if ($wins.Count -eq 0) { $wins = [Win32]::GetWindowsByTitle("oddeNova") }
    if ($wins.Count -gt 0) {
        # SWP_NOZORDER = 0x0004
        [Win32]::SetWindowPos($wins[0], [IntPtr]::Zero, 0, 0, $width, $height, 0x0004)
        break
    }
}
