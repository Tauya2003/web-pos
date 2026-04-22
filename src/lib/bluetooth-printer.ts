const PRINTER_SERVICES = [
  "000018f0-0000-1000-8000-00805f9b34fb",
  "e7810a71-73ae-499d-8c15-faa9aef0c3f2",
  "49535343-fe7d-4ae5-8fa9-9fafd205e455",
  "0000ff00-0000-1000-8000-00805f9b34fb",
  "0000ffe0-0000-1000-8000-00805f9b34fb",
];

const CHUNK_SIZE = 20;
const CHUNK_DELAY_MS = 20;
const STORAGE_KEY = "zimpos_bt_printer_id";
const STORAGE_NAME_KEY = "zimpos_bt_printer_name";

// In-memory cache for the current session
let cachedDevice: BluetoothDevice | null = null;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function onDisconnect() {
  // Device disconnected — clear cache so next print reconnects
  cachedDevice = null;
}

function rememberDevice(device: BluetoothDevice) {
  cachedDevice = device;
  device.addEventListener("gattserverdisconnected", onDisconnect);
  try {
    localStorage.setItem(STORAGE_KEY, device.id);
    localStorage.setItem(STORAGE_NAME_KEY, device.name ?? "Bluetooth Printer");
  } catch {
    // localStorage unavailable (SSR guard)
  }
}

/** Returns the name of the currently paired printer, or null. */
export function getPairedPrinterName(): string | null {
  if (cachedDevice) return cachedDevice.name ?? "Bluetooth Printer";
  try {
    return localStorage.getItem(STORAGE_NAME_KEY);
  } catch {
    return null;
  }
}

/** Forget the paired printer so the picker shows next time. */
export function forgetPrinter() {
  if (cachedDevice) {
    cachedDevice.removeEventListener("gattserverdisconnected", onDisconnect);
    if (cachedDevice.gatt?.connected) cachedDevice.gatt.disconnect();
    cachedDevice = null;
  }
  try {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(STORAGE_NAME_KEY);
  } catch {
    // ignore
  }
}

async function findWritableChar(server: BluetoothRemoteGATTServer) {
  for (const uuid of PRINTER_SERVICES) {
    try {
      const service = await server.getPrimaryService(uuid);
      const chars = await service.getCharacteristics();
      for (const char of chars) {
        if (char.properties.write || char.properties.writeWithoutResponse) {
          return char;
        }
      }
    } catch {
      // service not on this device — try next
    }
  }
  return null;
}

async function getOrPairDevice(forceNew = false): Promise<BluetoothDevice> {
  if (!navigator.bluetooth) {
    throw new Error("Web Bluetooth is not supported. Use Chrome or Edge on desktop.");
  }

  if (!forceNew) {
    // Try in-memory cache first
    if (cachedDevice) return cachedDevice;

    // Try to reconnect to the previously chosen device via getDevices()
    const savedId = (() => { try { return localStorage.getItem(STORAGE_KEY); } catch { return null; } })();
    if (savedId && "getDevices" in navigator.bluetooth) {
      const devices = await (navigator.bluetooth as Bluetooth & { getDevices(): Promise<BluetoothDevice[]> }).getDevices();
      const found = devices.find((d) => d.id === savedId);
      if (found) {
        rememberDevice(found);
        return found;
      }
    }
  }

  // Show the picker (first time or forced change)
  const device = await navigator.bluetooth.requestDevice({
    acceptAllDevices: true,
    optionalServices: PRINTER_SERVICES,
  });
  rememberDevice(device);
  return device;
}

export async function printViaBluetooth(data: Uint8Array, forceNew = false): Promise<void> {
  const device = await getOrPairDevice(forceNew);

  if (!device.gatt) throw new Error("This device does not support GATT.");

  const server = device.gatt.connected
    ? device.gatt
    : await device.gatt.connect();

  try {
    const char = await findWritableChar(server);
    if (!char) {
      throw new Error(
        "No writable characteristic found. Make sure the correct printer was selected."
      );
    }

    for (let offset = 0; offset < data.length; offset += CHUNK_SIZE) {
      const chunk = data.slice(offset, offset + CHUNK_SIZE);
      if (char.properties.writeWithoutResponse) {
        await char.writeValueWithoutResponse(chunk);
      } else {
        await char.writeValueWithResponse(chunk);
      }
      if (offset + CHUNK_SIZE < data.length) {
        await sleep(CHUNK_DELAY_MS);
      }
    }
  } finally {
    // Don't disconnect — keep alive so next print is instant
  }
}
