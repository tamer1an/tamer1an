# Windows hardware + performance-state report. Read-only.
# Run:  powershell -ExecutionPolicy Bypass -File spec-report.ps1
$ErrorActionPreference = 'SilentlyContinue'

$cpu = Get-CimInstance Win32_Processor |
  Select-Object Name, NumberOfCores, NumberOfLogicalProcessors, MaxClockSpeed

$ramTotalGB = [math]::Round(
  (Get-CimInstance Win32_ComputerSystem).TotalPhysicalMemory / 1GB, 2)

# Per-DIMM: rated Speed vs actually-running ConfiguredClockSpeed (XMP tell)
$dimms = Get-CimInstance Win32_PhysicalMemory | Select-Object `
  @{N='SizeGB';E={[math]::Round($_.Capacity/1GB,0)}}, `
  @{N='RatedMHz';E={$_.Speed}}, `
  @{N='RunningMHz';E={$_.ConfiguredClockSpeed}}, `
  DeviceLocator, Manufacturer, PartNumber

$xmpOn = -not ($dimms | Where-Object { $_.RunningMHz -lt $_.RatedMHz })

# GPU: AdapterRAM is a broken 32-bit field for >=4GB cards — prefer the registry
$gpu = Get-CimInstance Win32_VideoController | Select-Object Name, DriverVersion, `
  @{N='ReportedVRAM_GB';E={[math]::Round($_.AdapterRAM/1GB,2)}}
$vramReg = (Get-ItemProperty 'HKLM:\SYSTEM\CurrentControlSet\Control\Class\{4d36e968-e325-11ce-bfc1-08002be10318}\0000' `
  -Name 'HardwareInformation.qwMemorySize' -EA SilentlyContinue).'HardwareInformation.qwMemorySize'
$vramTrueGB = if ($vramReg) { [math]::Round($vramReg/1GB,2) } else { $null }

$board = Get-CimInstance Win32_BaseBoard | Select-Object Manufacturer, Product
$bios  = Get-CimInstance Win32_BIOS | Select-Object SMBIOSBIOSVersion, ReleaseDate
$plan  = (powercfg /getactivescheme)

[PSCustomObject]@{
  CPU              = $cpu
  RAM_Total_GB     = $ramTotalGB
  DIMMs            = $dimms
  XMP_EXPO_Applied = $xmpOn
  GPU              = $gpu
  GPU_TrueVRAM_GB  = $vramTrueGB
  Motherboard      = $board
  BIOS             = $bios
  ActivePowerPlan  = $plan
} | ConvertTo-Json -Depth 5

if (-not $xmpOn) {
  Write-Host "`n[!] Memory running BELOW rated speed — enable XMP/EXPO in BIOS." -Foreground Yellow
}
