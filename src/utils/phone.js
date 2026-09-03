export const phoneDigits = (value = '') => String(value).replace(/\D/g, '');

export const isValidPhoneNumber = (value = '') => /^\d{10}$/.test(phoneDigits(value));

export const formatPhoneNumber = (value = '') => {
  const digits = phoneDigits(value);
  if (!digits) return '';
  if (digits.length !== 10) return String(value).trim();
  return `${digits.slice(0, 3)} ${digits.slice(3, 6)} ${digits.slice(6)}`;
};

export const formatPhoneInput = (value = '') => {
  const digits = phoneDigits(value).slice(0, 10);
  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return `${digits.slice(0, 3)} ${digits.slice(3)}`;
  return `${digits.slice(0, 3)} ${digits.slice(3, 6)} ${digits.slice(6)}`;
};

export const phoneLink = (value = '') => {
  const digits = phoneDigits(value);
  return digits ? `tel:${digits}` : undefined;
};
