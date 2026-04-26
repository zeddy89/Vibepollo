export type GamepadVector = [number, number, number];

export interface GamepadSnapshot {
  buttons: number;
  lt: number;
  rt: number;
  lsX: number;
  lsY: number;
  rsX: number;
  rsY: number;
}

export type GamepadMappingSource = 'standard' | 'known' | 'fallback';

export interface GamepadMappingProfile {
  buttonMap: Map<number, number>;
  supportedButtons: number;
  capabilities: number;
  type: number;
  source: GamepadMappingSource;
  typeLabel: string;
  name: string;
}

export interface GamepadStatus {
  index: number;
  name: string;
  typeLabel: string;
  source: GamepadMappingSource;
}

export const GAMEPAD_TYPE = {
  unknown: 0,
  xbox: 1,
  playstation: 2,
  nintendo: 3,
} as const;

export const GAMEPAD_CAPS = {
  analogTriggers: 0x01,
  touchpad: 0x08,
  accel: 0x10,
  gyro: 0x20,
} as const;

export const GAMEPAD_BUTTONS = {
  dpadUp: 0x0001,
  dpadDown: 0x0002,
  dpadLeft: 0x0004,
  dpadRight: 0x0008,
  start: 0x0010,
  back: 0x0020,
  leftStick: 0x0040,
  rightStick: 0x0080,
  leftButton: 0x0100,
  rightButton: 0x0200,
  home: 0x0400,
  a: 0x1000,
  b: 0x2000,
  x: 0x4000,
  y: 0x8000,
  paddle1: 0x010000,
  paddle2: 0x020000,
  paddle3: 0x040000,
  paddle4: 0x080000,
  touchpadButton: 0x100000,
  miscButton: 0x200000,
} as const;

export const AXIS_DEADZONE = 0.08;

const STANDARD_BUTTON_MAP = new Map<number, number>([
  [0, GAMEPAD_BUTTONS.a],
  [1, GAMEPAD_BUTTONS.b],
  [2, GAMEPAD_BUTTONS.x],
  [3, GAMEPAD_BUTTONS.y],
  [4, GAMEPAD_BUTTONS.leftButton],
  [5, GAMEPAD_BUTTONS.rightButton],
  [8, GAMEPAD_BUTTONS.back],
  [9, GAMEPAD_BUTTONS.start],
  [10, GAMEPAD_BUTTONS.leftStick],
  [11, GAMEPAD_BUTTONS.rightStick],
  [12, GAMEPAD_BUTTONS.dpadUp],
  [13, GAMEPAD_BUTTONS.dpadDown],
  [14, GAMEPAD_BUTTONS.dpadLeft],
  [15, GAMEPAD_BUTTONS.dpadRight],
  [16, GAMEPAD_BUTTONS.home],
  [17, GAMEPAD_BUTTONS.miscButton],
]);

const KNOWN_GENERIC_ID_PATTERNS = [
  '8bitdo',
  'gamesir',
  'gulikit',
  'hori',
  'logitech',
  'mayflash',
  'powera',
  'razer',
  'stadia',
  'steelseries',
];

function typeLabel(type: number): string {
  if (type === GAMEPAD_TYPE.xbox) return 'Xbox';
  if (type === GAMEPAD_TYPE.playstation) return 'PlayStation';
  if (type === GAMEPAD_TYPE.nintendo) return 'Nintendo';
  return 'Generic';
}

export function resolveGamepadType(gamepad: Gamepad): number {
  const id = (gamepad.id || '').toLowerCase();
  if (id.includes('nintendo') || id.includes('switch') || id.includes('joy-con')) {
    return GAMEPAD_TYPE.nintendo;
  }
  if (id.includes('xbox') || id.includes('xinput')) {
    return GAMEPAD_TYPE.xbox;
  }
  if (
    id.includes('playstation') ||
    id.includes('dualshock') ||
    id.includes('dualsense') ||
    id.includes('ps4') ||
    id.includes('ps5') ||
    id.includes('wireless controller')
  ) {
    return GAMEPAD_TYPE.playstation;
  }
  return GAMEPAD_TYPE.unknown;
}

function resolveMappingSource(gamepad: Gamepad, type: number): GamepadMappingSource {
  if (gamepad.mapping === 'standard') return 'standard';
  if (type !== GAMEPAD_TYPE.unknown) return 'known';
  const id = (gamepad.id || '').toLowerCase();
  return KNOWN_GENERIC_ID_PATTERNS.some((pattern) => id.includes(pattern)) ? 'known' : 'fallback';
}

function resolveButtonMap(gamepad: Gamepad, type: number): Map<number, number> {
  const map = new Map(STANDARD_BUTTON_MAP);
  if (type === GAMEPAD_TYPE.playstation) {
    map.set(17, GAMEPAD_BUTTONS.touchpadButton);
  }
  if (gamepad.buttons.length > 18) {
    map.set(18, GAMEPAD_BUTTONS.paddle1);
  }
  if (gamepad.buttons.length > 19) {
    map.set(19, GAMEPAD_BUTTONS.paddle2);
  }
  if (gamepad.buttons.length > 20) {
    map.set(20, GAMEPAD_BUTTONS.paddle3);
  }
  if (gamepad.buttons.length > 21) {
    map.set(21, GAMEPAD_BUTTONS.paddle4);
  }
  return map;
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(max, Math.max(min, value));
}

export function applyDeadzone(value: number, deadzone = AXIS_DEADZONE): number {
  const safeValue = clamp(value, -1, 1);
  const abs = Math.abs(safeValue);
  if (abs <= deadzone) return 0;
  const scaled = (abs - deadzone) / (1 - deadzone);
  return Math.min(1, Math.max(0, scaled)) * Math.sign(safeValue);
}

function toInt16(value: number): number {
  return Math.round(clamp(value, -1, 1) * 32767);
}

function toUint8(value: number): number {
  return Math.round(clamp(value, 0, 1) * 255);
}

function normalizedTriggerAxis(value: number | undefined): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 0;
  const clamped = clamp(value, -1, 1);
  return clamped < 0 ? (clamped + 1) / 2 : clamped;
}

function readTrigger(
  gamepad: Gamepad,
  buttonIndex: number,
  axisCandidates: number[],
  ignoredAxes: Set<number>,
): number {
  let value = gamepad.buttons[buttonIndex]?.value ?? 0;
  for (const axisIndex of axisCandidates) {
    if (ignoredAxes.has(axisIndex)) continue;
    value = Math.max(value, normalizedTriggerAxis(gamepad.axes?.[axisIndex]));
  }
  return toUint8(value);
}

function readButtons(gamepad: Gamepad, buttonMap: Map<number, number>): number {
  let mask = 0;
  buttonMap.forEach((bit, index) => {
    const button = gamepad.buttons[index];
    if (button?.pressed) {
      mask |= bit;
    }
  });
  return mask;
}

function readHatDpad(gamepad: Gamepad): { buttons: number; axes: Set<number> } {
  const axes = gamepad.axes || [];
  let mask = 0;
  const usedAxes = new Set<number>();
  const pairs: Array<[number, number]> = [
    [6, 7],
    [8, 9],
    [4, 5],
  ];

  for (const [xIndex, yIndex] of pairs) {
    const rawX = axes[xIndex];
    const rawY = axes[yIndex];
    if (typeof rawX !== 'number' || typeof rawY !== 'number') continue;
    const x = applyDeadzone(rawX, 0.45);
    const y = applyDeadzone(rawY, 0.45);
    if (Math.abs(x) <= 0.5 && Math.abs(y) <= 0.5) continue;
    if (Math.abs(x) > 0.5 && Math.abs(y) > 0.5 && rawX === -1 && rawY === -1) continue;
    if (x <= -0.5) mask |= GAMEPAD_BUTTONS.dpadLeft;
    if (x >= 0.5) mask |= GAMEPAD_BUTTONS.dpadRight;
    if (y <= -0.5) mask |= GAMEPAD_BUTTONS.dpadUp;
    if (y >= 0.5) mask |= GAMEPAD_BUTTONS.dpadDown;
    if (mask) {
      usedAxes.add(xIndex);
      usedAxes.add(yIndex);
      break;
    }
  }

  return { buttons: mask, axes: usedAxes };
}

export function createGamepadMappingProfile(gamepad: Gamepad): GamepadMappingProfile {
  const type = resolveGamepadType(gamepad);
  const buttonMap = resolveButtonMap(gamepad, type);
  let supportedButtons = 0;
  buttonMap.forEach((bit) => {
    supportedButtons |= bit;
  });

  const motion = readGamepadMotion(gamepad);
  const capabilities =
    GAMEPAD_CAPS.analogTriggers |
    (type === GAMEPAD_TYPE.playstation ? GAMEPAD_CAPS.touchpad : 0) |
    (motion.accel || type === GAMEPAD_TYPE.playstation ? GAMEPAD_CAPS.accel : 0) |
    (motion.gyro || type === GAMEPAD_TYPE.playstation ? GAMEPAD_CAPS.gyro : 0);

  return {
    buttonMap,
    supportedButtons,
    capabilities,
    type,
    source: resolveMappingSource(gamepad, type),
    typeLabel: typeLabel(type),
    name: gamepad.id || `Gamepad ${gamepad.index + 1}`,
  };
}

export function readGamepadSnapshot(
  gamepad: Gamepad,
  profile: GamepadMappingProfile,
): GamepadSnapshot {
  const axes = gamepad.axes || [];
  const lx = applyDeadzone(axes[0] ?? 0);
  const ly = applyDeadzone(-(axes[1] ?? 0));
  const rx = applyDeadzone(axes[2] ?? 0);
  const ry = applyDeadzone(-(axes[3] ?? 0));
  const hat = readHatDpad(gamepad);
  const buttons = readButtons(gamepad, profile.buttonMap) | hat.buttons;

  return {
    buttons,
    lt: readTrigger(gamepad, 6, [4], hat.axes),
    rt: readTrigger(gamepad, 7, [5], hat.axes),
    lsX: toInt16(lx),
    lsY: toInt16(ly),
    rsX: toInt16(rx),
    rsY: toInt16(ry),
  };
}

function readMotionVector(value: unknown): GamepadVector | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const array = Array.isArray(value)
    ? value
    : (value as { length?: number; [index: number]: number });
  if (typeof array.length !== 'number' || array.length < 3) return undefined;
  const x = Number(array[0]);
  const y = Number(array[1]);
  const z = Number(array[2]);
  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) return undefined;
  return [x, y, z];
}

export function readGamepadMotion(gamepad: Gamepad): { gyro?: GamepadVector; accel?: GamepadVector } {
  const pose = (
    gamepad as { pose?: { angularVelocity?: unknown; linearAcceleration?: unknown } | null }
  ).pose;
  const motion = (
    gamepad as { motion?: { angularVelocity?: unknown; linearAcceleration?: unknown } }
  ).motion;
  const motionData = (
    gamepad as { motionData?: { angularVelocity?: unknown; linearAcceleration?: unknown } }
  ).motionData;
  const source = motion ?? motionData ?? pose ?? null;
  if (!source) return {};
  const gyro = readMotionVector(source.angularVelocity);
  const accel = readMotionVector(source.linearAcceleration);
  const result: { gyro?: GamepadVector; accel?: GamepadVector } = {};
  if (gyro) result.gyro = gyro;
  if (accel) result.accel = accel;
  return result;
}

export function buildGamepadStatus(
  index: number,
  profile: GamepadMappingProfile,
): GamepadStatus {
  return {
    index,
    name: profile.name,
    typeLabel: profile.typeLabel,
    source: profile.source,
  };
}
