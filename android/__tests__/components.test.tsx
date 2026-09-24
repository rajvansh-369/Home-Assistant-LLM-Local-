import { fireEvent, render, screen } from '@testing-library/react-native';
import { Fingerprint } from 'lucide-react-native';

import { Segmented, SwatchPicker, Switch, ToggleRow } from '@/components';

describe('Switch', () => {
  test('toggles and exposes its checked state', async () => {
    const onValueChange = jest.fn();
    await render(<Switch value={false} onValueChange={onValueChange} label="Lock when I leave" />);

    const control = screen.getByRole('switch', { name: 'Lock when I leave' });
    expect(control.props.accessibilityState).toMatchObject({ checked: false, disabled: false });

    await fireEvent.press(control);
    expect(onValueChange).toHaveBeenCalledWith(true);
  });

  test('ignores presses when disabled', async () => {
    const onValueChange = jest.fn();
    await render(<Switch value onValueChange={onValueChange} label="Fingerprint" disabled />);

    const control = screen.getByRole('switch', { name: 'Fingerprint' });
    expect(control.props.accessibilityState).toMatchObject({ checked: true, disabled: true });

    await fireEvent.press(control);
    expect(onValueChange).not.toHaveBeenCalled();
  });
});

test('ToggleRow toggles when the row is pressed', async () => {
  const onValueChange = jest.fn();
  await render(
    <ToggleRow icon={Fingerprint} title="Unlock with fingerprint" value onValueChange={onValueChange} />,
  );

  await fireEvent.press(screen.getByRole('switch', { name: 'Unlock with fingerprint' }));
  expect(onValueChange).toHaveBeenCalledWith(false);
});

test('Segmented selects an option and marks the selected one', async () => {
  const onChange = jest.fn();
  const options = [100, 150, 300, 500].map((m) => ({ value: m, label: `${m} m` }));
  await render(<Segmented label="Home area" options={options} value={150} onChange={onChange} />);

  // The group View stays non-accessible so TalkBack reaches each radio, so query it by label.
  expect(screen.getByLabelText('Home area').props.accessibilityRole).toBe('radiogroup');
  expect(screen.getByRole('radio', { name: '150 m' }).props.accessibilityState).toMatchObject({
    checked: true,
  });
  expect(screen.getByRole('radio', { name: '300 m' }).props.accessibilityState).toMatchObject({
    checked: false,
  });

  await fireEvent.press(screen.getByRole('radio', { name: '300 m' }));
  expect(onChange).toHaveBeenCalledWith(300);
});

test('SwatchPicker is a labelled radio group', async () => {
  const onChange = jest.fn();
  await render(<SwatchPicker value="mint" onChange={onChange} />);

  // The group View stays non-accessible so TalkBack reaches each radio, so query it by label.
  expect(screen.getByLabelText('Profile colour').props.accessibilityRole).toBe('radiogroup');
  expect(screen.getByRole('radio', { name: 'Mint' }).props.accessibilityState).toMatchObject({
    checked: true,
  });

  await fireEvent.press(screen.getByRole('radio', { name: 'Peach' }));
  expect(onChange).toHaveBeenCalledWith('peach');
});
