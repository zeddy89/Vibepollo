import {
  applyDeadzone,
  createGamepadMappingProfile,
  GAMEPAD_BUTTONS,
  GAMEPAD_TYPE,
  readGamepadSnapshot,
} from '@web/utils/webrtc/gamepadMapper';

function button(value = 0, pressed = value > 0.5): GamepadButton {
  return {
    pressed,
    touched: pressed,
    value,
  };
}

function fakeGamepad({
  id = 'Generic Gamepad',
  index = 0,
  mapping = '',
  axes = [0, 0, 0, 0],
  buttons = [],
}: {
  id?: string;
  index?: number;
  mapping?: GamepadMappingType | '';
  axes?: number[];
  buttons?: GamepadButton[];
}): Gamepad {
  return {
    id,
    index,
    mapping,
    axes,
    buttons,
    connected: true,
    timestamp: 1,
  } as unknown as Gamepad;
}

function buttons(count: number, pressed: number[] = []): GamepadButton[] {
  return Array.from({ length: count }, (_value, index) => button(pressed.includes(index) ? 1 : 0));
}

describe('WebRTC gamepad mapper', () => {
  test('uses standard Xbox-style mappings directly', () => {
    const standardButtons = buttons(17, [0, 12]);
    standardButtons[6] = button(0.25, false);
    standardButtons[7] = button(1, true);
    const pad = fakeGamepad({
      id: 'Xbox Wireless Controller',
      mapping: 'standard',
      axes: [0.5, -0.5, -1, 1],
      buttons: standardButtons,
    });

    const profile = createGamepadMappingProfile(pad);
    const snapshot = readGamepadSnapshot(pad, profile);

    expect(profile.source).toBe('standard');
    expect(profile.type).toBe(GAMEPAD_TYPE.xbox);
    expect(snapshot.buttons & GAMEPAD_BUTTONS.a).toBeTruthy();
    expect(snapshot.buttons & GAMEPAD_BUTTONS.dpadUp).toBeTruthy();
    expect(snapshot.lt).toBe(64);
    expect(snapshot.rt).toBe(255);
    expect(snapshot.lsX).toBeGreaterThan(0);
    expect(snapshot.lsY).toBeGreaterThan(0);
    expect(snapshot.rsX).toBeLessThan(0);
    expect(snapshot.rsY).toBeLessThan(0);
  });

  test('detects PlayStation and Switch controllers without standard mapping', () => {
    const playstation = createGamepadMappingProfile(
      fakeGamepad({ id: 'Wireless Controller', buttons: buttons(18) }),
    );
    const nintendo = createGamepadMappingProfile(
      fakeGamepad({ id: 'Nintendo Switch Pro Controller', buttons: buttons(17) }),
    );

    expect(playstation.source).toBe('known');
    expect(playstation.type).toBe(GAMEPAD_TYPE.playstation);
    expect(playstation.supportedButtons & GAMEPAD_BUTTONS.touchpadButton).toBeTruthy();
    expect(nintendo.source).toBe('known');
    expect(nintendo.type).toBe(GAMEPAD_TYPE.nintendo);
  });

  test('falls back to conventional generic button order for unknown pads', () => {
    const pad = fakeGamepad({
      id: 'DragonRise Generic USB Joystick',
      axes: [0, 0, 0, 0],
      buttons: buttons(12, [1, 8, 9]),
    });
    const profile = createGamepadMappingProfile(pad);
    const snapshot = readGamepadSnapshot(pad, profile);

    expect(profile.source).toBe('fallback');
    expect(profile.type).toBe(GAMEPAD_TYPE.unknown);
    expect(snapshot.buttons & GAMEPAD_BUTTONS.b).toBeTruthy();
    expect(snapshot.buttons & GAMEPAD_BUTTONS.back).toBeTruthy();
    expect(snapshot.buttons & GAMEPAD_BUTTONS.start).toBeTruthy();
  });

  test('converts hat-switch axes into d-pad buttons', () => {
    const pad = fakeGamepad({
      id: 'Generic DirectInput Pad',
      axes: [0, 0, 0, 0, 0, 0, -1, 1],
      buttons: buttons(10),
    });
    const profile = createGamepadMappingProfile(pad);
    const snapshot = readGamepadSnapshot(pad, profile);

    expect(snapshot.buttons & GAMEPAD_BUTTONS.dpadLeft).toBeTruthy();
    expect(snapshot.buttons & GAMEPAD_BUTTONS.dpadDown).toBeTruthy();
  });

  test('normalizes analog trigger axes when buttons do not expose values', () => {
    const pad = fakeGamepad({
      id: 'Generic Trigger Axis Pad',
      axes: [0, 0, 0, 0, -0.5, 0.5],
      buttons: buttons(6),
    });
    const profile = createGamepadMappingProfile(pad);
    const snapshot = readGamepadSnapshot(pad, profile);

    expect(snapshot.lt).toBe(64);
    expect(snapshot.rt).toBe(128);
  });

  test('applies a stable deadzone before stick conversion', () => {
    expect(applyDeadzone(0.04)).toBe(0);
    expect(applyDeadzone(-0.04)).toBe(0);
    expect(applyDeadzone(0.5)).toBeGreaterThan(0);
  });
});
