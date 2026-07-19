type OtherNamesField = HTMLInputElement | HTMLTextAreaElement;

const otherNamesAttributesToCopy = ['name', 'id', 'placeholder', 'required'] as const;

const normalizeOtherNamesValue = (value: string): string => value.replaceAll(/\s+/g, ' ').trim();

const getOtherNamesLines = (value: string): string[] => value.match(/\S+/g) ?? [];

const isOtherNamesTextarea = (field: OtherNamesField): field is HTMLTextAreaElement =>
  field.tagName === 'TEXTAREA';

const copyOtherNamesAttributes = (from: OtherNamesField, to: OtherNamesField): void => {
  // Keep form binding attributes when switching between input and textarea.
  for (const attributeName of otherNamesAttributesToCopy) {
    const value = from.getAttribute(attributeName);

    if (value !== null) {
      to.setAttribute(attributeName, value);
    }
  }
};

const normalizeOtherNamesField = (field: OtherNamesField | null): void => {
  if (field && isOtherNamesTextarea(field)) {
    field.value = normalizeOtherNamesValue(field.value);
  }
};

const createOtherNamesInput = (current: OtherNamesField): HTMLInputElement => {
  const input = document.createElement('input');

  copyOtherNamesAttributes(current, input);
  input.type = 'text';
  input.className = 'w-full max-w-360px string optional iac-autocomplete';
  input.value = normalizeOtherNamesValue(current.value);

  return input;
};

const createOtherNamesTextarea = (
  current: OtherNamesField,
  form: HTMLFormElement | null,
): HTMLTextAreaElement => {
  const textarea = document.createElement('textarea');

  copyOtherNamesAttributes(current, textarea);
  textarea.className = 'text optional iac-autocomplete';

  const lines = getOtherNamesLines(current.value);

  textarea.value = lines.join('\n');
  textarea.rows = Math.min(20, Math.max(4, lines.length + 1));
  textarea.addEventListener('keydown', (event: KeyboardEvent) => {
    if (!((event.ctrlKey || event.metaKey) && event.key === 'Enter')) {
      return;
    }

    event.preventDefault();
    form?.requestSubmit();
  });

  return textarea;
};

export function initOtherNamesEditor(): void {
  const field = document.querySelector<OtherNamesField>('#artist_other_names_string');

  if (!field || document.querySelector('#other-names-toggle-btn')) {
    return;
  }

  const form = field.closest<HTMLFormElement>('form');

  // Wrap the field so the toggle button stays aligned to the right.
  const wrapper = document.createElement('div');

  wrapper.className = 'other-names-wrapper';
  field.before(wrapper);
  wrapper.append(field);

  const button = document.createElement('button');

  button.id = 'other-names-toggle-btn';
  button.type = 'button';
  button.className = 'other-names-toggle-btn';
  button.textContent = 'expand';
  button.title = 'Toggle multi-line view';
  wrapper.append(button);

  button.addEventListener('click', (event: MouseEvent) => {
    event.preventDefault();

    const current = wrapper.querySelector<OtherNamesField>('#artist_other_names_string');

    if (!current) {
      console.warn('Other names field not found inside wrapper.');
      button.disabled = true;

      return;
    }

    const isTextarea = isOtherNamesTextarea(current);
    const nextField = isTextarea
      ? createOtherNamesInput(current)
      : createOtherNamesTextarea(current, form);

    current.replaceWith(nextField);
    button.textContent = isTextarea ? 'expand' : 'collapse';
  });

  // Safety net: normalize back to space-separated on form submit,
  // in case the user submits while still in textarea mode.
  form?.addEventListener(
    'submit',
    () => {
      normalizeOtherNamesField(
        wrapper.querySelector<OtherNamesField>('#artist_other_names_string'),
      );
    },
    { capture: true },
  );
}
