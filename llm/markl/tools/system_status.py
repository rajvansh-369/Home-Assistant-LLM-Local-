"""
System status -- CPU, RAM, GPU, temperature. Ported from Mark-L's
actions/system_monitor.py (the snapshot only; the alert loop needs a voice).

No subprocess calls: psutil, and NVML or WMI through Python where present.
"""

import ctypes
import json
import platform
import time

import psutil

from markl.registry import tool

_OS = platform.system()

# A missing backend is discovered once, not re-probed on every call.
_nvml_lib = None
_nvml_ok = None
_pynvml = None
_pynvml_ok = None
_wmi_conn = None
_wmi_ok = None


def _nvml_gpu():
    """GPU utilisation via the NVML library, loaded directly."""

    global _nvml_lib, _nvml_ok

    if _nvml_ok is False:
        return -1.0

    try:
        class _Util(ctypes.Structure):
            _fields_ = [("gpu", ctypes.c_uint), ("memory", ctypes.c_uint)]

        if _nvml_lib is None:
            if _OS == "Windows":
                candidates = ("nvml", r"C:\Windows\System32\nvml.dll")
                load = ctypes.WinDLL
            else:
                candidates = ("libnvidia-ml.so.1", "libnvidia-ml.so", "libnvidia-ml.dylib")
                load = ctypes.CDLL

            for name in candidates:
                try:
                    lib = load(name)
                    lib.nvmlInit_v2()
                    _nvml_lib = lib
                    break
                except Exception:
                    continue

        if _nvml_lib is None:
            _nvml_ok = False
            return -1.0

        device = ctypes.c_void_p()
        _nvml_lib.nvmlDeviceGetHandleByIndex_v2(0, ctypes.byref(device))
        util = _Util()
        _nvml_lib.nvmlDeviceGetUtilizationRates(device, ctypes.byref(util))
        _nvml_ok = True

        return float(util.gpu)

    except Exception:
        _nvml_ok = False
        return -1.0


def _gpu_usage():
    global _pynvml, _pynvml_ok

    if _pynvml_ok is None:
        try:
            import pynvml

            pynvml.nvmlInit()
            _pynvml, _pynvml_ok = pynvml, True
        except Exception:
            _pynvml_ok = False

    if _pynvml_ok:
        try:
            handle = _pynvml.nvmlDeviceGetHandleByIndex(0)
            return float(_pynvml.nvmlDeviceGetUtilizationRates(handle).gpu)
        except Exception:
            _pynvml_ok = False

    return _nvml_gpu()


def _cpu_temp():
    try:
        temps = psutil.sensors_temperatures()

        for name in ("coretemp", "k10temp", "cpu_thermal", "acpitz",
                     "cpu-thermal", "zenpower", "it8688"):
            if temps.get(name):
                return temps[name][0].current

        for entries in temps.values():
            if entries:
                return entries[0].current
    except Exception:
        pass

    global _wmi_conn, _wmi_ok

    if _OS == "Windows" and _wmi_ok is not False:
        try:
            if _wmi_conn is None:
                import wmi

                _wmi_conn = wmi.WMI(namespace="root/wmi")

            zones = _wmi_conn.MSAcpi_ThermalZoneTemperature()
            _wmi_ok = True

            if zones:
                return (zones[0].CurrentTemperature / 10.0) - 273.15
        except Exception:
            _wmi_ok, _wmi_conn = False, None

    return -1.0


def get_system_status():
    cpu = psutil.cpu_percent(interval=0.2)
    ram = psutil.virtual_memory()
    temp = _cpu_temp()
    gpu = _gpu_usage()

    uptime = time.time() - psutil.boot_time()

    return {
        "cpu_percent": round(cpu, 1),
        "ram_percent": round(ram.percent, 1),
        "ram_used_gb": round(ram.used / 1024 ** 3, 1),
        "ram_total_gb": round(ram.total / 1024 ** 3, 1),
        "cpu_temp_c": round(temp, 1) if temp > 0 else None,
        "gpu_percent": round(gpu, 1) if gpu >= 0 else None,
        "uptime": "{}h {}m".format(int(uptime // 3600), int((uptime % 3600) // 60)),
        "process_count": len(psutil.pids()),
    }


@tool(
    name="system_status",
    description=(
        "Returns real-time metrics of the home PC this assistant runs on: CPU usage, "
        "RAM, GPU load, CPU temperature, uptime and process count. Use when the user "
        "asks about the computer's performance, temperature, memory or resource usage."
    ),
    parameters={"type": "OBJECT", "properties": {}},
    timeout=15,
)
def system_status_tool(params):
    return json.dumps(get_system_status())
